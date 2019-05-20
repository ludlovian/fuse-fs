'use strict'

import test from 'ava'
import { exec as _exec } from 'child_process'
import { MemFS } from 'mem-fs'
import FuseFS from '../src'
import fs from 'fs'
import { promisify as P } from 'util'

const exec = P(_exec)
const MOUNT = './sandbox'

test.serial.before(async t => {
  await exec(`rm -rf ${MOUNT}`)
  await exec(`mkdir ${MOUNT}`)
})

test.serial.after(async t => {
  await exec(`rm -rf ${MOUNT}`)
})

test.beforeEach(async t => {
  const mount = await P(fs.mkdtemp)(MOUNT + '/')
  const memFs = new MemFS()
  const fuseFs = new FuseFS(memFs)
  await fuseFs.mount(mount)
  t.context = { mount, memFs, fuseFs }
})

test.afterEach(async t => {
  const { mount, fuseFs } = t.context
  await fuseFs.unmount()
  await P(fs.rmdir)(mount)
})

test('mount & unmount', t => {
  t.pass()
})

test('basic file access', async t => {
  const { mount, memFs } = t.context
  await P(fs.mkdir)(`${mount}/foo`)
  t.true(memFs.statSync('/foo').isDirectory())
})

test('before', async t => {
  const { mount, fuseFs, memFs } = t.context

  let count = 0
  fuseFs.before('mkdir', async ctx => {
    t.is(ctx.name, 'mkdir')
    t.is(ctx.args[0], '/foo')
    t.falsy(ctx.results)
    count++
  })
  await P(fs.mkdir)(`${mount}/foo`)
  t.is(count, 1)
  t.true(memFs.statSync('/foo').isDirectory())
})

test('after', async t => {
  const { mount, fuseFs, memFs } = t.context

  let count = 0
  fuseFs.after('mkdir', async ctx => {
    t.is(ctx.name, 'mkdir')
    t.is(ctx.args[0], '/foo')
    t.true(Array.isArray(ctx.results))
    t.falsy(ctx.results[0])
    count++
  })
  await P(fs.mkdir)(`${mount}/foo`)
  t.is(count, 1)
  t.true(memFs.statSync('/foo').isDirectory())
})
