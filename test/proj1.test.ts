import * as vscode from 'vscode'
import * as assert from 'assert'
import { MultiBranchCheckoutAPI } from '../src/commands'
import { log } from '../src/channelLogger'
import { toUri } from '../src/utils'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const git = require('@npmcli/git')

function gitInit (workspaceUri?: vscode.Uri) {
    if (!workspaceUri) {
        workspaceUri = vscode.workspace.workspaceFolders![0].uri
    }
    log.info('git init -b main (cwd=' + workspaceUri.fsPath + ')')
    return git.spawn(['init', '-b', 'main'], { cwd: workspaceUri.fsPath }).then((r: any) => {
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
    return git.spawn(['branch', '--show-current'], { cwd: workspaceUri.fsPath })
        .then((r: any) => {
            if (r.stdout) {
                log.info('current branch: ' + r.stdout)
            }
            if (r.stderr) {
                log.error(r.stderr)
                throw new Error(r.stderr)
            }
        }, (e: unknown) => {
            log.error('[git branch] e=' + e)
            throw e
        })
}

suite('proj1', () => {

    suiteSetup(async () => {

        const workspaceUri = vscode.workspace.workspaceFolders![0].uri
        await vscode.workspace.fs.delete(toUri('test_file.txt'))
        await vscode.workspace.fs.delete(toUri('.git'), { recursive: true })
        await vscode.workspace.fs.delete(toUri('.worktrees'), { recursive: true })
        await gitInit().then(() => {
            log.info('git repo re-initialized')
        })
        return true
    })

    suiteTeardown(() => {
        log.info('900')
        log.info('suiteTeardown')
    })

    test('proj1.1 - no worktrees yet', () => {
        const ext = vscode.extensions.getExtension('kherring.multi-branch-checkout')
        if (!ext) {
            assert.fail('Extension not found')
        }

        assert.equal('a', 'a')
        return ext.activate()
            .then(() => {
                const api: MultiBranchCheckoutAPI = ext.exports
                const view = api.getWorktreeView()
                assert.equal(view.getRootNodes().length, 0)
            })
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

    test('proj1.3 - create file, move to test tree', async () => {
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
})
