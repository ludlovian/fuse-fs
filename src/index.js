'use strict'

import Method from './method'
import PSwitch from 'pswitch'
import fuse from 'fuse-bindings'

export default class FuseFS {
  constructor (fs, options = {}) {
    this.options = options
    this.mountPoint = undefined
    this.mounted = new PSwitch(false)
    this.operations = Method.getMethods(fs)
    this.fuseOps = {
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
    for (const method of this.operations.values()) {
      this.fuseOps[method.name] = method.invokeFuse.bind(method)
    }
  }

  mount (mountPoint) {
    this.mountPoint = mountPoint

    const _debug = process.env.DEBUG
    const fuseDebug = /\bfuse\b/i.test(_debug)
    // istanbul ignore else
    if (!fuseDebug) process.env.DEBUG = ''

    return new Promise((resolve, reject) => {
      fuse.mount(mountPoint, this.fuseOps, err => {
        // istanbul ignore if
        if (err) return reject(err)
        // istanbul ignore else
        if (!fuseDebug) process.env.DEBUG = _debug
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

  before (...args) {
    return addIntercepts(this.operations, 'before', args)
  }

  after (...args) {
    return addIntercepts(this.operations, 'after', args)
  }

  async invoke (name, ...args) {
    const method = this.operations.get(name)
    if (!method) return [-1]
    return method.invoke(...args)
  }
}

function addIntercepts (ops, type, args) {
  const methods = args.filter(x => typeof x === 'string')
  const fns = args.filter(x => typeof x === 'function')
  const undos = []
  for (const method of methods) {
    for (const fn of fns) {
      if (ops.has(method)) {
        const list = ops.get(method)[type]
        list.push(fn)
        undos.push(() => {
          const ix = list.indexOf(fn)
          if (~ix) list.splice(ix, 1)
        })
      }
    }
  }
  return () => undos.forEach(fn => fn())
}
