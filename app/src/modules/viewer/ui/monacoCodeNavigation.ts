// コードナビゲーション（定義ジャンプ・参照一覧）の Monaco への配線。
// gotoSymbol contrib（クリックジェスチャ・F12・peek）は template に同梱済みで、
// provider を登録するだけで有効になる。peek は対象ファイルの model が無いと
// 中身を描画できないため、全 readable ファイルの model をここで事前生成する。
import type { IRange, languages, Uri } from "monaco-editor";
import type { CodeTarget } from "../../review";
import type { FileContent } from "../../workspace";
import {
  definitionsFor,
  loadCodeNavigationIndex,
  referencesFor,
  type SymbolLocation,
} from "../codeNavigation";
import type { SymbolIndex } from "../../../shared/snapshot/SymbolIndex";
import { languageFromPath } from "../language";
import { monaco } from "../monacoEnvironment";

type Disposable = { dispose(): void };

type InstallArgs = {
  files: FileContent[];
  symbolIndex: SymbolIndex;
  onOpenLocation(target: CodeTarget): void;
};

// CodeViewer の `path` prop と同じ構成規則。相対パスの先頭セグメントが
// authority に解釈されるため、逆変換は文字列化した URI からの引き当てで行う。
function uriFor(path: string): Uri {
  return monaco.Uri.parse(`file://${path}`);
}

function rangeOf(location: SymbolLocation): IRange {
  return {
    startLineNumber: location.lineNumber,
    startColumn: location.startColumn,
    endLineNumber: location.lineNumber,
    endColumn: location.endColumn,
  };
}

export function installCodeNavigation({
  files,
  symbolIndex,
  onOpenLocation,
}: InstallArgs): Disposable {
  const pathByUri = new Map<string, string>();
  const createdModels: Disposable[] = [];
  for (const file of files) {
    const uri = uriFor(file.path);
    pathByUri.set(uri.toString(), file.path);
    if (!monaco.editor.getModel(uri)) {
      createdModels.push(
        monaco.editor.createModel(
          file.content,
          file.language || languageFromPath(file.path),
          uri,
        ),
      );
    }
  }

  const index = loadCodeNavigationIndex(symbolIndex);
  const wordAt = (
    model: Parameters<languages.DefinitionProvider["provideDefinition"]>[0],
    position: Parameters<languages.DefinitionProvider["provideDefinition"]>[1],
  ) => model.getWordAtPosition(position)?.word;

  const definitionProvider = monaco.languages.registerDefinitionProvider("*", {
    provideDefinition(model, position) {
      const word = wordAt(model, position);
      if (!word) {
        return [];
      }
      const definitions = definitionsFor(index, word);
      if (definitions.length > 0) {
        return definitions.map((location) => ({
          uri: uriFor(location.path),
          range: rangeOf(location),
        }));
      }
      // 宣言が無くても参照が複数あるなら、ホバー位置自身を唯一の定義として返す。
      // Monaco は定義が現在位置と一致するとき参照 peek を開くので、Cmd+ホバーで
      // 下線が出て「Cmd+クリックで何か起きる」ことが見た目で分かる。
      if (referencesFor(index, word).length < 2) {
        return [];
      }
      const wordRange = model.getWordAtPosition(position);
      if (!wordRange) {
        return [];
      }
      return [
        {
          uri: model.uri,
          range: {
            startLineNumber: position.lineNumber,
            startColumn: wordRange.startColumn,
            endLineNumber: position.lineNumber,
            endColumn: wordRange.endColumn,
          },
        },
      ];
    },
  });

  const referenceProvider = monaco.languages.registerReferenceProvider("*", {
    provideReferences(model, position) {
      const word = wordAt(model, position);
      if (!word) {
        return [];
      }
      return referencesFor(index, word).map((location) => ({
        uri: uriFor(location.path),
        range: rangeOf(location),
      }));
    },
  });

  // 別ファイルへの遷移を横取りして workspace の openFile 経路へ流す
  // （同一ファイル内の遷移は Monaco が内部で処理し、ここへは来ない）。
  const opener = monaco.editor.registerEditorOpener({
    openCodeEditor(_source, resource, selectionOrPosition) {
      const path = pathByUri.get(resource.toString());
      if (!path) {
        return false;
      }
      const range: IRange =
        selectionOrPosition && "startLineNumber" in selectionOrPosition
          ? selectionOrPosition
          : selectionOrPosition
            ? {
                startLineNumber: selectionOrPosition.lineNumber,
                startColumn: selectionOrPosition.column,
                endLineNumber: selectionOrPosition.lineNumber,
                endColumn: selectionOrPosition.column,
              }
            : {
                startLineNumber: 1,
                startColumn: 1,
                endLineNumber: 1,
                endColumn: 1,
              };
      onOpenLocation({
        file: path,
        range: {
          startLine: range.startLineNumber,
          startColumn: range.startColumn,
          endLine: range.endLineNumber,
          endColumn: range.endColumn,
        },
      });
      return true;
    },
  });

  return {
    dispose() {
      definitionProvider.dispose();
      referenceProvider.dispose();
      opener.dispose();
      createdModels.forEach((model) => model.dispose());
    },
  };
}
