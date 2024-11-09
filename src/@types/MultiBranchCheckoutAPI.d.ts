
// types.d.ts

import { Uri } from 'vscode'
import { WorktreeView } from '../worktreeView'
import { WorktreeNode } from '../worktreeNodes'

export interface MultiBrnachCheckoutAPI {
    getWorktreeView(): WorktreeView
    createWorktree(branchName?: string): Promise<void>
    getNodes(uriOrPath: Uri | string): WorktreeNode
}
