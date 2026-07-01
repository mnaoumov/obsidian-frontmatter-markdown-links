import type { App } from 'obsidian';

import { castTo } from 'obsidian-dev-utils/object-utils';
import {
  parseLink,
  parseLinks
} from 'obsidian-dev-utils/obsidian/link';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { FrontMatterLinksViewPlugin } from './frontmatter-links-editor-extension.ts';

interface DecorationWidget {
  toDOM(): HTMLElement;
}

interface DecorationWidgetArg {
  widget: DecorationWidget;
}

interface IterateConfig {
  enter(node: SyntaxNode): void;
  from: number;
  to: number;
}

interface SelectionRange {
  from: number;
  to: number;
}

interface SyntaxNode {
  from: number;
  name: string;
  to: number;
}

interface ViewPluginDefineConfig {
  decorations?(pluginValue: unknown): unknown;
}

type ViewPluginFactory = (view: object) => ViewPluginFactoryResult;

interface ViewPluginFactoryResult {
  readonly decorations: object;
  update(update: ViewPluginUpdate): void;
}

interface ViewPluginUpdate {
  docChanged: boolean;
  selectionSet: boolean;
  view: object;
  viewportChanged: boolean;
}

const { mockDecoration, mockSyntaxTreeFactory, mockViewPluginDefine } = vi.hoisted(() => {
  const decorationMark = vi.fn().mockReturnValue({});
  const decorationReplace = vi.fn().mockReturnValue({});
  return {
    mockDecoration: { mark: decorationMark, replace: decorationReplace },
    mockSyntaxTreeFactory: vi.fn().mockReturnValue({ iterate: vi.fn() }),
    mockViewPluginDefine: vi.fn().mockReturnValue({ extension: [] })
  };
});

vi.mock('obsidian-dev-utils/obsidian/link', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian-dev-utils/obsidian/link')>();
  return {
    ...actual,
    parseLink: vi.fn(actual.parseLink),
    parseLinks: vi.fn(actual.parseLinks)
  };
});

vi.mock('@codemirror/language', () => ({
  syntaxTree: mockSyntaxTreeFactory
}));

vi.mock('@codemirror/state', () => {
  class RangeSetBuilder {
    public add = vi.fn();
    public finish = vi.fn().mockReturnValue([]);
  }
  return { RangeSetBuilder };
});

vi.mock('@codemirror/view', () => ({
  Decoration: mockDecoration,
  EditorView: vi.fn(),
  ViewPlugin: {
    define: mockViewPluginDefine
  },
  ViewUpdate: vi.fn(),
  WidgetType: class WidgetType {
    public toDOM(): HTMLElement {
      return createSpan();
    }
  }
}));

afterEach(() => {
  vi.clearAllMocks();
  mockViewPluginDefine.mockReturnValue({ extension: [] });
  mockSyntaxTreeFactory.mockReturnValue({ iterate: vi.fn() });
  mockDecoration.mark.mockReturnValue({});
  mockDecoration.replace.mockReturnValue({});
  // Note: vi.clearAllMocks() clears call history only, not implementations.
  // The parseLink/parseLinks mocks retain their importOriginal-based implementations.
});

function createMockApp(): App {
  return castTo<App>({
    workspace: {
      getActiveViewOfType: vi.fn().mockReturnValue(null)
    }
  });
}

function createMockView(valueText: string, selectionRanges: SelectionRange[] = []): object {
  const RANGE_FROM = 0;
  const RANGE_TO = 100;
  return {
    state: {
      doc: {
        lineAt: vi.fn().mockReturnValue({ number: 1 }),
        sliceString: vi.fn().mockReturnValue(valueText)
      },
      selection: { ranges: selectionRanges }
    },
    visibleRanges: [{ from: RANGE_FROM, to: RANGE_TO }]
  };
}

function getViewPluginFactory(app: App): undefined | ViewPluginFactory {
  mockViewPluginDefine.mockClear();
  FrontMatterLinksViewPlugin.createEditorExtension(app);
  return castTo<undefined | ViewPluginFactory>(mockViewPluginDefine.mock.calls[0]?.[0]);
}

function setupSyntaxTreeWithNodes(nodes: SyntaxNode[]): void {
  mockSyntaxTreeFactory.mockReturnValue({
    iterate: vi.fn().mockImplementation((options: IterateConfig) => {
      for (const node of nodes) {
        options.enter(node);
      }
    })
  });
}

describe('FrontMatterLinksViewPlugin.createEditorExtension', () => {
  it('should return the extension produced by ViewPlugin.define', () => {
    const extension = FrontMatterLinksViewPlugin.createEditorExtension(createMockApp());

    expect(extension).toEqual({ extension: [] });
  });

  it('should define a ViewPlugin with a decorations accessor', () => {
    FrontMatterLinksViewPlugin.createEditorExtension(createMockApp());

    expect(mockViewPluginDefine).toHaveBeenCalledWith(
      expect.any(Function),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- vitest asymmetric matchers (objectContaining/any) are typed as any.
      expect.objectContaining({ decorations: expect.any(Function) })
    );
  });

  it('should construct a FrontMatterLinksViewPlugin via the factory in ViewPlugin.define', () => {
    const factory = getViewPluginFactory(createMockApp());
    expect(factory).toBeTypeOf('function');

    const viewPluginInstance = factory?.(createMockView(''));

    expect(viewPluginInstance).toBeDefined();
    expect(viewPluginInstance?.decorations).toBeDefined();
  });

  it('should provide a decorations accessor that returns plugin decorations', () => {
    getViewPluginFactory(createMockApp());

    const options = castTo<undefined | ViewPluginDefineConfig>(mockViewPluginDefine.mock.calls[0]?.[1]);
    const mockPluginValue = { decorations: ['decoration1'] };

    const decorations = options?.decorations?.(mockPluginValue);

    expect(decorations).toEqual(['decoration1']);
  });
});

describe('FrontMatterLinksViewPlugin - update triggering', () => {
  it('should not update decorations when nothing changed', () => {
    const factory = getViewPluginFactory(createMockApp());
    const emptyView = {
      state: { doc: { lineAt: vi.fn().mockReturnValue({ number: 1 }), sliceString: vi.fn().mockReturnValue('') }, selection: { ranges: [] } },
      visibleRanges: []
    };
    const viewPluginInstance = factory?.(emptyView);
    const initialDecorations = viewPluginInstance?.decorations;

    viewPluginInstance?.update({
      docChanged: false,
      selectionSet: false,
      view: createMockView(''),
      viewportChanged: false
    });

    expect(viewPluginInstance?.decorations).toBe(initialDecorations);
  });

  it('should rebuild decorations when the document changes', () => {
    const factory = getViewPluginFactory(createMockApp());
    const emptyView = {
      state: { doc: { lineAt: vi.fn().mockReturnValue({ number: 1 }), sliceString: vi.fn().mockReturnValue('') }, selection: { ranges: [] } },
      visibleRanges: []
    };
    const viewPluginInstance = factory?.(emptyView);
    const initialDecorations = viewPluginInstance?.decorations;

    viewPluginInstance?.update({ docChanged: true, selectionSet: false, view: createMockView(''), viewportChanged: false });

    expect(viewPluginInstance?.decorations).not.toBe(initialDecorations);
  });

  it('should rebuild decorations when viewport changes', () => {
    const factory = getViewPluginFactory(createMockApp());
    const emptyView = {
      state: { doc: { lineAt: vi.fn().mockReturnValue({ number: 1 }), sliceString: vi.fn().mockReturnValue('') }, selection: { ranges: [] } },
      visibleRanges: []
    };
    const viewPluginInstance = factory?.(emptyView);
    const initialDecorations = viewPluginInstance?.decorations;

    viewPluginInstance?.update({ docChanged: false, selectionSet: false, view: createMockView(''), viewportChanged: true });

    expect(viewPluginInstance?.decorations).not.toBe(initialDecorations);
  });

  it('should rebuild decorations when selection changes', () => {
    const factory = getViewPluginFactory(createMockApp());
    const emptyView = {
      state: { doc: { lineAt: vi.fn().mockReturnValue({ number: 1 }), sliceString: vi.fn().mockReturnValue('') }, selection: { ranges: [] } },
      visibleRanges: []
    };
    const viewPluginInstance = factory?.(emptyView);
    const initialDecorations = viewPluginInstance?.decorations;

    viewPluginInstance?.update({ docChanged: false, selectionSet: true, view: createMockView(''), viewportChanged: false });

    expect(viewPluginInstance?.decorations).not.toBe(initialDecorations);
  });
});

describe('buildDecorations - handleValue node type paths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDecoration.mark.mockReturnValue({});
    mockDecoration.replace.mockReturnValue({});
    mockViewPluginDefine.mockReturnValue({ extension: [] });
  });

  it('should skip decoration when no hmd-frontmatter_meta node triggers colon processing', () => {
    setupSyntaxTreeWithNodes([{ from: 5, name: 'other-node', to: 10 }]);
    const factory = getViewPluginFactory(createMockApp());

    factory?.(createMockView('[[some/link]]'));

    expect(mockDecoration.mark).not.toHaveBeenCalled();
    expect(mockDecoration.replace).not.toHaveBeenCalled();
  });

  it('should add Decoration.mark for wikilink in source mode', () => {
    const app = createMockApp();
    vi.mocked(app.workspace.getActiveViewOfType).mockReturnValue(castTo<ReturnType<typeof app.workspace.getActiveViewOfType>>({
      getMode: vi.fn().mockReturnValue('source'),
      getState: vi.fn().mockReturnValue({ source: true })
    }));

    setupSyntaxTreeWithNodes([
      { from: 0, name: 'hmd-frontmatter_meta', to: 5 },
      { from: 6, name: 'value', to: 22 }
    ]);
    const factory = getViewPluginFactory(app);
    factory?.(createMockView('[[some/link]]', []));

    expect(mockDecoration.mark).toHaveBeenCalled();
  });

  it('should add Decoration.replace for markdown link not in source mode and not selected', () => {
    setupSyntaxTreeWithNodes([
      { from: 0, name: 'hmd-frontmatter_meta', to: 5 },
      { from: 6, name: 'value', to: 25 }
    ]);
    const factory = getViewPluginFactory(createMockApp());
    factory?.(createMockView('[note](target.md)', []));

    expect(mockDecoration.replace).toHaveBeenCalled();
  });

  it('should apply Decoration.mark for hmd-frontmatter_string node in source mode', () => {
    const app = createMockApp();
    vi.mocked(app.workspace.getActiveViewOfType).mockReturnValue(castTo<ReturnType<typeof app.workspace.getActiveViewOfType>>({
      getMode: vi.fn().mockReturnValue('source'),
      getState: vi.fn().mockReturnValue({ source: true })
    }));

    setupSyntaxTreeWithNodes([
      { from: 0, name: 'hmd-frontmatter_meta', to: 5 },
      // Quoted string: value extracted from from+1..to-1.
      { from: 6, name: 'hmd-frontmatter_string', to: 26 }
    ]);
    const factory = getViewPluginFactory(app);
    factory?.(createMockView('[note](target.md)', []));

    expect(mockDecoration.mark).toHaveBeenCalled();
  });

  it('should handle comment_hmd-frontmatter node by trimming value before processing', () => {
    setupSyntaxTreeWithNodes([
      { from: 0, name: 'hmd-frontmatter_meta', to: 5 },
      { from: 6, name: 'comment_hmd-frontmatter', to: 10 },
      { from: 11, name: 'value', to: 30 }
    ]);
    const factory = getViewPluginFactory(createMockApp());
    factory?.(createMockView('[note](target.md)   '));

    expect(mockDecoration.replace).toHaveBeenCalled();
  });

  it('should not add decorations when visible ranges are empty (no nodes)', () => {
    setupSyntaxTreeWithNodes([]);
    const factory = getViewPluginFactory(createMockApp());
    factory?.(createMockView(''));

    expect(mockDecoration.mark).not.toHaveBeenCalled();
    expect(mockDecoration.replace).not.toHaveBeenCalled();
  });

  it('should extend the value range across multiple nodes on the same line after the colon', () => {
    // Two value nodes after the meta node on the same line: the first sets valueStartIndex,
    // The second leaves valueStartIndex unchanged and only extends valueEndIndex.
    setupSyntaxTreeWithNodes([
      { from: 0, name: 'hmd-frontmatter_meta', to: 5 },
      { from: 6, name: 'value', to: 10 },
      { from: 11, name: 'value', to: 25 }
    ]);
    const factory = getViewPluginFactory(createMockApp());
    factory?.(createMockView('[note](target.md)', []));

    expect(mockDecoration.replace).toHaveBeenCalled();
  });

  it('should reset per-line state when line number changes across nodes', () => {
    let lineCallCount = 0;
    setupSyntaxTreeWithNodes([
      { from: 0, name: 'hmd-frontmatter_meta', to: 5 },
      { from: 6, name: 'value', to: 22 },
      // Second line - different line number.
      { from: 30, name: 'hmd-frontmatter_meta', to: 35 },
      { from: 36, name: 'value', to: 52 }
    ]);

    const factory = getViewPluginFactory(createMockApp());
    const mockView = {
      state: {
        doc: {
          lineAt: vi.fn().mockImplementation(() => {
            lineCallCount++;
            return { number: lineCallCount <= 2 ? 1 : 2 };
          }),
          sliceString: vi.fn().mockReturnValue('[note](target.md)')
        },
        selection: { ranges: [] }
      },
      visibleRanges: [{ from: 0, to: 100 }]
    };
    factory?.(mockView);

    expect(mockDecoration.replace).toHaveBeenCalled();
  });
});

describe('getLinkStylingInfos - link type variations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDecoration.mark.mockReturnValue({});
    mockDecoration.replace.mockReturnValue({});
    mockViewPluginDefine.mockReturnValue({ extension: [] });
  });

  function setupSourceModeApp(): App {
    const app = createMockApp();
    vi.mocked(app.workspace.getActiveViewOfType).mockReturnValue(castTo<ReturnType<typeof app.workspace.getActiveViewOfType>>({
      getMode: vi.fn().mockReturnValue('source'),
      getState: vi.fn().mockReturnValue({ source: true })
    }));
    return app;
  }

  function setupMetaValueNodes(): void {
    setupSyntaxTreeWithNodes([
      { from: 0, name: 'hmd-frontmatter_meta', to: 5 },
      { from: 6, name: 'value', to: 100 }
    ]);
  }

  it('should add mark for plain external URL', () => {
    setupMetaValueNodes();
    const factory = getViewPluginFactory(setupSourceModeApp());
    factory?.(createMockView('https://example.com', []));

    expect(mockDecoration.mark).toHaveBeenCalled();
  });

  it('should add mark for angle bracket link <URL>', () => {
    setupMetaValueNodes();
    const factory = getViewPluginFactory(setupSourceModeApp());
    factory?.(createMockView('<https://example.com>', []));

    expect(mockDecoration.mark).toHaveBeenCalled();
  });

  it('should add mark for wikilink with alias [[A|B]]', () => {
    setupMetaValueNodes();
    const factory = getViewPluginFactory(setupSourceModeApp());
    factory?.(createMockView('[[note|alias]]', []));

    expect(mockDecoration.mark).toHaveBeenCalled();
  });

  it('should add mark for image link ![A](B) in source mode', () => {
    setupMetaValueNodes();
    const factory = getViewPluginFactory(setupSourceModeApp());
    factory?.(createMockView('![alt](image.png)', []));

    expect(mockDecoration.mark).toHaveBeenCalled();
  });

  it('should add mark instead of replace when selection overlaps link range', () => {
    setupSyntaxTreeWithNodes([
      { from: 0, name: 'hmd-frontmatter_meta', to: 5 },
      { from: 6, name: 'value', to: 25 }
    ]);
    const factory = getViewPluginFactory(createMockApp());
    // Selection overlaps the link region.
    const selectionRanges = [{ from: 6, to: 12 }];
    factory?.(createMockView('[note](target.md)', selectionRanges));

    expect(mockDecoration.mark).toHaveBeenCalled();
  });

  it('should add replace for external URL in non-source mode when not selected', () => {
    setupMetaValueNodes();
    // Default app has getActiveViewOfType returning null (not source mode).
    const factory = getViewPluginFactory(createMockApp());
    factory?.(createMockView('https://example.com', []));

    expect(mockDecoration.replace).toHaveBeenCalled();
  });

  it('should add replace for angle bracket link in non-source mode when not selected', () => {
    setupMetaValueNodes();
    const factory = getViewPluginFactory(createMockApp());
    factory?.(createMockView('<https://example.com>', []));

    expect(mockDecoration.replace).toHaveBeenCalled();
  });

  it('should return empty mark styling when parseLink returns null for parsed link raw text in source mode', () => {
    setupMetaValueNodes();
    // In source mode, getLinkStylingInfos is called. Override parseLinks/parseLink.
    const fakeRaw = 'NOT_A_REAL_LINK';
    vi.mocked(parseLinks).mockReturnValueOnce([{
      endOffset: fakeRaw.length,
      hasAngleBrackets: false,
      isEmbed: false,
      isExternal: false,
      isWikilink: false,
      raw: fakeRaw,
      startOffset: 0,
      url: fakeRaw
    }]);
    // ParseLink returns null => getLinkStylingInfos returns [] => no mark decorations added.
    vi.mocked(parseLink).mockReturnValueOnce(null);
    // Use source mode so we take the getLinkStylingInfos path (not the replace path).
    const factory = getViewPluginFactory(setupSourceModeApp());
    factory?.(createMockView(fakeRaw, []));

    expect(mockDecoration.mark).not.toHaveBeenCalled();
  });

  it('should return empty mark styling when no group pattern matches an empty raw value', () => {
    setupMetaValueNodes();
    // In source mode, getLinkStylingInfos is called. An empty string raw won't match any
    // Group regex (all use .+ which requires at least one character), hitting the no-match path.
    const emptyRaw = '';
    vi.mocked(parseLinks).mockReturnValueOnce([{
      endOffset: 0,
      hasAngleBrackets: false,
      isEmbed: false,
      isExternal: false,
      isWikilink: false,
      raw: emptyRaw,
      startOffset: 0,
      url: emptyRaw
    }]);
    // ParseLink must return non-null for the empty raw (so we pass the null guard).
    vi.mocked(parseLink).mockReturnValueOnce({
      endOffset: 0,
      hasAngleBrackets: false,
      isEmbed: false,
      isExternal: false,
      isWikilink: false,
      raw: emptyRaw,
      startOffset: 0,
      url: emptyRaw
    });
    const factory = getViewPluginFactory(setupSourceModeApp());
    factory?.(createMockView(emptyRaw, []));

    // No mark styling because empty string doesn't match any group regex pattern.
    expect(mockDecoration.mark).not.toHaveBeenCalled();
  });
});

describe('LinkWidget.toDOM', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDecoration.mark.mockReturnValue({});
    mockDecoration.replace.mockReturnValue({});
    mockViewPluginDefine.mockReturnValue({ extension: [] });
  });

  it('should create a span with a nested anchor when Decoration.replace is called', () => {
    setupSyntaxTreeWithNodes([
      { from: 0, name: 'hmd-frontmatter_meta', to: 5 },
      { from: 6, name: 'value', to: 25 }
    ]);
    // Not in source mode, no selection => triggers Decoration.replace with a LinkWidget.
    const factory = getViewPluginFactory(createMockApp());
    factory?.(createMockView('[note](target.md)', []));

    expect(mockDecoration.replace).toHaveBeenCalled();

    // Get the widget from the Decoration.replace call and invoke toDOM().
    const widgetArg = mockDecoration.replace.mock.calls[0]?.[0] as DecorationWidgetArg | undefined;
    const domEl = widgetArg?.widget.toDOM();

    expect(domEl).toBeInstanceOf(HTMLElement);
  });

  it('should create anchor with link url and class cm-underline', () => {
    setupSyntaxTreeWithNodes([
      { from: 0, name: 'hmd-frontmatter_meta', to: 5 },
      { from: 6, name: 'value', to: 25 }
    ]);
    const factory = getViewPluginFactory(createMockApp());
    factory?.(createMockView('[note](target.md)', []));

    const widgetArg = mockDecoration.replace.mock.calls[0]?.[0] as DecorationWidgetArg | undefined;
    const domEl = widgetArg?.widget.toDOM();

    const anchor = domEl?.querySelector('a.cm-underline');
    expect(anchor).toBeTruthy();
  });

  it('should fall back to the url for the anchor text when the link has no alias', () => {
    setupSyntaxTreeWithNodes([
      { from: 0, name: 'hmd-frontmatter_meta', to: 5 },
      { from: 6, name: 'value', to: 25 }
    ]);
    // A plain external URL has no alias, so the anchor text falls back to the url.
    const factory = getViewPluginFactory(createMockApp());
    factory?.(createMockView('https://example.com', []));

    const widgetArg = mockDecoration.replace.mock.calls[0]?.[0] as DecorationWidgetArg | undefined;
    const domEl = widgetArg?.widget.toDOM();

    const anchor = domEl?.querySelector('a.cm-underline');
    expect(anchor?.textContent).toBe('https://example.com');
  });

  it('should pass isInQuotes=true when from hmd-frontmatter_string node', () => {
    setupSyntaxTreeWithNodes([
      { from: 0, name: 'hmd-frontmatter_meta', to: 5 },
      // Quoted string: value extracted from from+1..to-1; triggers isInQuotes=true path.
      { from: 6, name: 'hmd-frontmatter_string', to: 26 }
    ]);
    const factory = getViewPluginFactory(createMockApp());
    factory?.(createMockView('[note](target.md)', []));

    const widgetArg = mockDecoration.replace.mock.calls[0]?.[0] as DecorationWidgetArg | undefined;
    const domEl = widgetArg?.widget.toDOM();

    // In isInQuotes mode, the outer span gets cls='', not 'cm-hmd-frontmatter cm-string'.
    expect(domEl).toBeInstanceOf(HTMLElement);
    expect(domEl?.classList.contains('cm-hmd-frontmatter')).toBe(false);
  });
});
