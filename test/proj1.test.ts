import * as vscode from 'vscode'
import * as assert from 'assert'
import { MultiBranchCheckoutAPI } from '../src/commands'
import { log } from '../src/channelLogger'
import { toUri, deleteFile } from '../src/utils'
import util from 'util'
import child_process from 'child_process'
import { WorktreeFile } from '../src/worktreeNodes'
const exec = util.promisify(child_process.exec)

function gitInit (workspaceUri?: vscode.Uri) {
    if (!workspaceUri) {
        workspaceUri = vscode.workspace.workspaceFolders![0].uri
    }
    log.info('git init -b main (cwd=' + workspaceUri.fsPath + ')')
    return exec('git init -b main', { cwd: workspaceUri.fsPath }).then((r: any) => {
        if (r.stdout) {
            log.info(r.stdout)
        }
        if (r.stderr) {
            log.error(r.stderr)
            throw new Error(r.stderr)
        }
    }, (e: unknown) => {
        log.error('[git init] e=' + e)
        throw e
    })
}

function gitBranch (workspaceUri?: vscode.Uri) {
    if (!workspaceUri) {
        workspaceUri = vscode.workspace.workspaceFolders![0].uri
    }
    return exec('git branch --show-current', { cwd: workspaceUri.fsPath })
        .then((r: any) => {
            log.info('current branch: ' + r.stdout)
        })
}

function sleep (timeout: number) {
    log.info('sleeping for ' + timeout + 'ms')
    const prom = new Promise((resolve) => setTimeout(resolve, timeout))
    return prom
}

suite('proj1', () => {

    suiteSetup('proj1 setup', async () => {
        log.info('100')
        deleteFile('test_file.txt')
        log.info('101')
        deleteFile('.git')
        log.info('102')
        deleteFile('.worktrees')
        log.info('103')
        await gitInit().then(() => {
            log.info('104')
            log.info('git repo re-initialized')
        })
        log.info('105')
        return true
    })

    suiteTeardown('proj1 teardown', () => {
        log.info('900')
        log.info('suiteTeardown')
    })

    test('proj1.1 - no worktrees yet', async () => {
        await vscode.workspace.fs.writeFile(toUri('.gitignore'), Buffer.from('.vscode/settings.json\n.worktrees/'))
        const ext = vscode.extensions.getExtension('kherring.multi-branch-checkout')
        if (!ext) {
            assert.fail('Extension not found')
        }

        assert.equal('a', 'a')
        await ext.activate()
        const api: MultiBranchCheckoutAPI = ext.exports
        const tree = api.getWorktreeView().getRootNodes()
        assert.equal(tree.length, 1)
    })

    test('proj1.2 - create first worktree', async () => {
        const ext = vscode.extensions.getExtension('kherring.multi-branch-checkout')
        if (!ext) {
            assert.fail('Extension not found')
        }
        if (!ext.isActive) {
            await ext.activate()
                .then(() => {
                }, (e) => {
                    log.error('activate failed! e=' + e)
                    assert.fail(e)
                })
        }

        if (!ext.isActive) {
            assert.fail('Extension not activated')
        }

        await gitBranch()

        const api: MultiBranchCheckoutAPI = ext.exports
        const r = await api.createWorktree('test2')
            .then(() => {
                const tree = api.getWorktreeView().getRootNodes()
                assert.equal(tree.length, 2)
                return true
            }, (e) => {
                throw e
            })
        return r
    })

    test('proj1.3 - create file, copy to test tree', async () => {
        const ext = vscode.extensions.getExtension('kherring.multi-branch-checkout')
        if (!ext) {
            assert.fail('Extension not found')
            return
        }
        const api = ext.exports as MultiBranchCheckoutAPI
        if (!api) {
            assert.fail('Extension not found')
            return
        }
        const uri = toUri('test_file.txt')
        await vscode.workspace.fs.writeFile(uri, Buffer.from('test file content'))
        await api.refresh()
        api.copyToWorktree(api.getFileNode(uri))
        assert.ok(toUri('.worktrees/test2/test_file.txt'))
    })

    test('proj1.4 - create file, move to test tree', async () => {
        const ext = vscode.extensions.getExtension('kherring.multi-branch-checkout')
        if (!ext) {
            assert.fail('Extension not found')
            return
        }
        const api = ext.exports as MultiBranchCheckoutAPI
        if (!api) {
            assert.fail('Extension not found')
            return
        }
        const uri = toUri('test_4.txt')
        await api.createWorktree('secondTree')
        await vscode.workspace.fs.writeFile(uri, Buffer.from('test file content'))
        await sleep(1000)
        // await api.refresh()

        const nodes = api.getNodes(uri)
        for (const node of nodes) {
            if (node instanceof WorktreeFile) {
                log.info('node: ' + node.id + ' ' + node.disposed)
                log.info('parent: ' + node.getParent()?.id)
            }
        }

        api.moveToWorktree(api.getFileNode(uri), 'secondTree')
        assert.ok(toUri('.worktrees/test2/test_file.txt'))
    })

    test('proj1.5 - stage two files', async () => {
        const ext = vscode.extensions.getExtension('kherring.multi-branch-checkout')
        if (!ext) {
            assert.fail('Extension not found')
            return
        }
        const api = ext.exports as MultiBranchCheckoutAPI
        if (!api) {
            assert.fail('Extension not found')
            return
        }

        const uri1 = toUri('.worktrees/test2/test_staging_1.txt')
        const uri2 = toUri('.worktrees/test2/test_staging_2.txt')
        await vscode.workspace.fs.writeFile(uri1, Buffer.from('test staging 1 content'))
        await vscode.workspace.fs.writeFile(uri2, Buffer.from('test staging 2 content'))

        log.info('waiting for 1 second')
        await new Promise((resolve) => setTimeout(resolve, 1000))

        log.info('waiting for 2 second')
        await setTimeout(() => {}, 2000)
        log.info('wait complete')

        // validate before staging
        const node1 = api.getFileNode(uri1)
        const node2 = api.getFileNode(uri2)
        const fg_untracked = node1.getParent()
        log.info('fg_untracked: ' + fg_untracked.label)
        for (const c of fg_untracked.children) {
            log.info('child: ' + c.label)
        }
        assert.strictEqual(fg_untracked.children.length, 3, "untracked before")

        // stage 2 files and validate
        await api.stage(node1)
        await api.stage(node2)
        const stage1 = api.getFileNode(uri1)
        const fg_staged = stage1.getParent()
        log.info('fg_staged: ' + fg_staged.label)
        for (const c of fg_staged.children) {
            log.info('  child: ' + c.label)
        }
        assert.strictEqual(fg_staged.children.length, 2, "staged")
        log.info('fg_untracked: ' + fg_untracked.label)
        for (const c of fg_untracked.children) {
            log.info('  child: ' + c.label + ' ' + c.disposed)
        }
        assert.strictEqual(fg_untracked.children.length, 1, "untracked")

        await api.unstage(stage1)
        const post_unstage_1 = api.getFileNode(uri1)
        const post_unstage_2 = api.getFileNode(uri2)

        assert.strictEqual(post_unstage_1.group, 'Untracked')
        assert.strictEqual(post_unstage_2.group, 'Staged')
        log.info('Untracked node.id=' + post_unstage_1.getParent())
        for (const c of post_unstage_1.getParent().children) {
            log.info('  child: ' + c.label)
        }
        assert.strictEqual(post_unstage_1.getParent().children.length, 2, "post untracked")
        log.info('Staged node.id=' + post_unstage_2.getParent())
        for (const c of post_unstage_2.getParent().children) {
            log.info('  child: ' + c.label)
        }
        assert.strictEqual(post_unstage_2.getParent().children.length, 1, "post staged")
    })

})
