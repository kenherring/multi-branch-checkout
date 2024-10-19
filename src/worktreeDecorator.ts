// https://stackoverflow.com/questions/74449432/how-to-add-and-select-color-for-nodes-tree-view-items-in-explorer-view-in-my-vsc

import { Disposable, Event, EventEmitter, FileDecoration, FileDecorationProvider, Tab, TabInputText, ThemeColor, Uri, window } from "vscode"

export class TreeFileDecorationProvider implements FileDecorationProvider {

	private disposables: Array<Disposable> = []

	private readonly _onDidChangeFileDecorations: EventEmitter<Uri | Uri[]> = new EventEmitter< Uri | Uri[]>()
	readonly onDidChangeFileDecorations: Event<Uri | Uri[]> = this._onDidChangeFileDecorations.event

	constructor() {
		this.disposables = []
		this.disposables.push(window.registerFileDecorationProvider(this))
	}

	async updateActiveEditor(activeTab: Tab): Promise<void> {

		if (activeTab.input instanceof TabInputText)
			this._onDidChangeFileDecorations.fire(activeTab.input.uri)

		// filter to get only non-activeTabs
		activeTab.group.tabs.map( tab => {
		if (!tab.isActive && tab.input instanceof TabInputText)
			this._onDidChangeFileDecorations.fire(tab.input.uri)
	})
}

	async provideFileDecoration(uri: Uri): Promise<FileDecoration | undefined | null> {
		const activeEditor = window.activeTextEditor?.document.uri
		if (uri.fsPath === activeEditor?.fsPath) {
			return {
				badge: "⇐",
				color: new ThemeColor("charts.red"),
				// color: new vscode.ThemeColor("tab.activeBackground"),
				// tooltip: ""
			}
		}
		else
			return null  // to get rid of the custom fileDecoration
	}

	dispose() {
		this.disposables.forEach((d) => d.dispose())
	}
}
