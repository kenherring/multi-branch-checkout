import * as vscode from 'vscode'
import * as assert from 'assert'
import { WorktreeView } from '../src/worktreeView'
import { MultiBrnachCheckoutAPI } from '../src/api/multiBranchCheckout';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const git = require('@npmcli/git')

function gitInit (workspaceUri?: vscode.Uri) {
    if (!workspaceUri) {
        workspaceUri = vscode.workspace.workspaceFolders![0].uri
    }
    console.log('git init -b main (cwd=' + workspaceUri.fsPath + ')')
    return git.spawn(['init', '-b', 'main'], { cwd: workspaceUri.fsPath }).then((r) => {
        if (r.stdout) {
            console.log(r.stdout)
        }
        if (r.stderr) {
            console.error(r.stderr)
            throw new Error(r.stderr)
        }
    }, (e: unknown) => {
        console.error('[git init] e=' + e)
        throw e
    })
}

function gitBranch (workspaceUri?: vscode.Uri) {
    if (!workspaceUri) {
        workspaceUri = vscode.workspace.workspaceFolders![0].uri
    }
    return git.spawn(['branch', '--show-current'], { cwd: workspaceUri.fsPath })
        .then((r) => {
            if (r.stdout) {
                console.log('current branch: ' + r.stdout)
            }
            if (r.stderr) {
                console.error(r.stderr)
                throw new Error(r.stderr)
            }
        }, (e: unknown) => {
            console.error('[git branch] e=' + e)
            throw e
        })
}

suite('proj1', () => {

    suiteSetup(async () => {
        console.log('100')
        const workspaceUri = vscode.workspace.workspaceFolders![0].uri
        console.log('101')
        await vscode.workspace.fs.delete(vscode.Uri.joinPath(workspaceUri, '.git'), { recursive: true })
        console.log('102')
        await vscode.workspace.fs.delete(vscode.Uri.joinPath(workspaceUri, '.worktrees'), { recursive: true })
        console.log('103')
        await gitInit().then(() => {
            console.log('104')
            console.log('git repo re-initialized')
        })
        console.log('105')
        return true
    })

    suiteTeardown(() => {
        console.log('900')
        console.log('suiteTeardown')
    })

    test('test1', () => {
        console.log('200')
        const ext = vscode.extensions.getExtension('kherring.multi-branch-checkout')
        console.log('201')
        if (!ext) {
            console.log('202')
            assert.fail('Extension not found')
        }

        console.log('203')
        assert.equal('a', 'a')
        console.log('204')
        return ext.activate()
            .then(() => {
                console.log('205')
                const view: WorktreeView = ext.exports.getWorktreeView()
                console.log('206')
                assert.equal(view.getRootNodes().length, 0)
                console.log('207')
            })
    })

    test('test2', async () => {
        console.log('300')
        const ext = vscode.extensions.getExtension('kherring.multi-branch-checkout')
        console.log('301')
        if (!ext) {
            console.log('302')
            assert.fail('Extension not found')
        }
        console.log('303')
        if (!ext.isActive) {
            console.log('304')
            await ext.activate()
                .then(() => {
                    console.log('305')
                }, (e) => {
                    console.log('306')
                    console.error('activate failed! e=' + e)
                    assert.fail(e)
                })
            console.log('307')
        }
        console.log('308')

        if (!ext.isActive) {
            console.log('309')
            assert.fail('Extension not activated')
        }

        await gitBranch()

        console.log('310')
        const api = ext.exports as MultiBrnachCheckoutAPI
        console.log('311')
        await api.createWorktree('test2')
            .then(() => {
                console.log('312')
                const tree = api.getWorktreeView().getRootNodes()

                for (const t of tree) {
                    console.log(t.label)
                }
                assert.equal(tree.length, 2)
                console.log('313')
            }, (e) => {
                console.log('314')
                console.error(e)
                console.log('315')
                assert.fail(e)
            })
        console.log('316')
    })
})
