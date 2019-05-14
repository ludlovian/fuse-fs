'use strict'

import Operations from './operations'
import PSwitch from 'pswitch'
import fuse from 'fuse-bindings'

const singlePathMethods = [
  'getattr',
  'readdir',
  'access',
  'truncate',
  'readlink',
  'chown',
  'chmod',
  'unlink',
  'mkdir',
  'rmdir',
  'utimens',
  'open',
  'create'
]

const dualPathMethods = ['rename', 'link', 'symlink']

export default class FuseFS {
  constructor (fs, options = {}) {
    this.options = options
    this.mountPoint = undefined
    this.mounted = new PSwitch(false)
    this.operations = new Operations(fs)
  }

  mount (mountPoint) {
    this.mountPoint = mountPoint
    const ops = {
      ...this.operations.getFuseOps(),
      ...this.options,
      init: cb => {
        this.mounted.set(true)
        cb(null)
      },
      destroy: cb => {
        this.mounted.set(false)
        cb(null)
      }
    }
    const _debug = process.env.DEBUG
    const fuseDebug = /(?:^|,)fuse(?:,|$)/i.test(_debug)
    // istanbul ignore else
    if (!fuseDebug) {
      // wipe out debug before FUSE starts as it assumes any non-zero
      // value means we are debugging FUSE
      process.env.DEBUG = ''
    }

    return new Promise((resolve, reject) => {
      fuse.mount(mountPoint, ops, err => {
        // istanbul ignore if
        if (err) return reject(err)

        // istanbul ignore else
        if (!fuseDebug) {
          process.env.DEBUG = _debug
        }
        resolve(this.mounted.when(true))
      })
    })
  }

  unmount () {
    return new Promise((resolve, reject) => {
      fuse.unmount(this.mountPoint, err => {
        // istanbul ignore if
        if (err) return reject(err)
        resolve(this.mounted.when(false))
      })
    })
  }

  beforeCall (name, intercept) {
    return this.operations.beforeCall(name, intercept)
  }

  afterCall (name, intercept) {
    return this.operations.afterCall(name, intercept)
  }

  pathAdjust (adjustor) {
    const undo = []
    for (const name of singlePathMethods) {
      undo.push(this.beforeCall(name, adjustSinglePath))
    }
    for (const name of dualPathMethods) {
      undo.push(this.beforeCall(name, adjustDualPath))
    }

    return () => undo.forEach(fn => fn())

    function adjustSinglePath (ctx) {
      ctx.args[0] = adjustor(ctx.args[0], ctx.name, 0)
    }

    function adjustDualPath (ctx) {
      ctx.args[0] = adjustor(ctx.args[0], ctx.name, 0)
      ctx.args[1] = adjustor(ctx.args[1], ctx.name, 1)
    }
  }

  on (name, callback) {
    return this.afterCall(name, async ctx => {
      callback(ctx)
    })
  }
}
