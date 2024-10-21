## TreeView

If you would like to perform some UI operations on the view programmatically, you can use `window.createTreeView` instead of `window.registerDataProvider`. This will give access to the view which you can use for performing view operations.

```typescript
vscode.window.createTreeView('ftpExplorer', {
	treeDataProvider: new FtpTreeDataProvider(),
});
```

See [ftpExplorer.ts](src/ftpExplorer.ts) for the implementation.
