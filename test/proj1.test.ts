import * as vscode from 'vscode'
import * as assert from 'assert'
import { WorktreeView } from '../src/worktreeView'
import { MultiBrnachCheckoutAPI } from '../src/api/multiBranchCheckout';
import { log } from '../src/channelLogger'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const git = require('@npmcli/git')

function gitInit (workspaceUri?: vscode.Uri) {
    if (!workspaceUri) {
        workspaceUri = vscode.workspace.workspaceFolders![0].uri
    }
    log.info('git init -b main (cwd=' + workspaceUri.fsPath + ')')
    return git.spawn(['init', '-b', 'main'], { cwd: workspaceUri.fsPath }).then((r) => {
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
        .then((r) => {
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
        log.info('100')
        const workspaceUri = vscode.workspace.workspaceFolders![0].uri
        log.info('101')
        await vscode.workspace.fs.delete(vscode.Uri.joinPath(workspaceUri, '.git'), { recursive: true })
        log.info('102')
        await vscode.workspace.fs.delete(vscode.Uri.joinPath(workspaceUri, '.worktrees'), { recursive: true })
        log.info('103')
        await gitInit().then(() => {
            log.info('104')
            log.info('git repo re-initialized')
        })
        log.info('105')
        return true
    })

    suiteTeardown(() => {
        log.info('900')
        log.info('suiteTeardown')
    })

    test('test1', () => {
        log.info('200')
        const ext = vscode.extensions.getExtension('kherring.multi-branch-checkout')
        log.info('201')
        if (!ext) {
            log.info('202')
            assert.fail('Extension not found')
        }

        log.info('203')
        assert.equal('a', 'a')
        log.info('204')
        return ext.activate()
            .then(() => {
                log.info('205')
                const view: WorktreeView = ext.exports.getWorktreeView()
                log.info('206')
                assert.equal(view.getRootNodes().length, 0)
                log.info('207')
            })
    })

    test('test2', async () => {
        log.info('300')
        const ext = vscode.extensions.getExtension('kherring.multi-branch-checkout')
        log.info('301')
        if (!ext) {
            log.info('302')
            assert.fail('Extension not found')
        }
        log.info('303')
        if (!ext.isActive) {
            log.info('304')
            await ext.activate()
                .then(() => {
                    log.info('305')
                }, (e) => {
                    log.info('306')
                    log.error('activate failed! e=' + e)
                    assert.fail(e)
                })
            log.info('307')
        }
        log.info('308')

        if (!ext.isActive) {
            log.info('309')
            assert.fail('Extension not activated')
        }

        await gitBranch()

        log.info('310')
        const api = ext.exports as MultiBrnachCheckoutAPI
        log.info('311')
        await api.createWorktree('test2')
            .then(() => {
                log.info('312')
                const tree = api.getWorktreeView().getRootNodes()

                for (const t of tree) {
                    log.info(t.label)
                }
                assert.equal(tree.length, 2)
                log.info('313')
            }, (e) => {
                log.info('314')
                log.error(e)
                log.info('315')
                assert.fail(e)
            })
        log.info('316')
    })
})
