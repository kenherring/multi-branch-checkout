
// types.d.ts

import { WorktreeView } from '../worktreeView';

export interface MultiBrnachCheckoutAPI {
    getWorktreeView(): WorktreeView;
    createWorktree(branchName?: string): Promise<void>;
}
