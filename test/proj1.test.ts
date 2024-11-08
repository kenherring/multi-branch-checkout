import * as vscode from 'vscode'
import * as assert from 'assert'
import { MultiBranchCheckoutAPI } from '../src/commands';
import { log } from '../src/channelLogger'
import { toUri } from '../src/utils';

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
                const api: MultiBranchCheckoutAPI = ext.exports
                const view = api.getWorktreeView()
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

        const api: MultiBranchCheckoutAPI = ext.exports
        await api.createWorktree('test2')
            .then(() => {
                const tree = api.getWorktreeView().getRootNodes()
                assert.equal(tree.length, 2)
            }, (e) => {
                assert.fail(e)
            })
        log.info('316')
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
        await api.copyToWorktree(api.getFileNode(uri))
        assert.ok(toUri('.worktrees/test2/test_file.txt'))
    })
})
