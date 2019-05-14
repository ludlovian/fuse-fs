'use strict'

import fuse from 'fuse-bindings'

const fuseMethods = [
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
  'rename',
  'link',
  'symlink',
  'utimens',
  'fgetattr',
  'ftruncate',
  'release',
  'fsync',
  'open',
  'create',
  'read',
  'write'
]

const renames = {
  getattr: 'stat',
  utimens: 'utimes',
  fgetattr: 'fstat',
  release: 'close',
  create: 'open'
}

export default class Operations {
  constructor (fs) {
    this.fs = fs
    this.ops = new Map()
    for (const name of fuseMethods) {
      const op = Operation.create(fs, name)
      if (!op) continue
      this.ops.set(name, op)
    }

    this.applyStandardIntercepts()
  }

  beforeCall (name, intercept) {
    const op = this.ops.get(name)
    if (!op) return noop
    return addCallback(op.preIntercepts, intercept)
  }

  afterCall (name, intercept) {
    const op = this.ops.get(name)
    if (!op) return noop
    return addCallback(op.postIntercepts, intercept)
  }

  getFuseOps () {
    return Array.from(this.ops.entries()).reduce(
      (ops, [name, op]) => ({ ...ops, [name]: op.call }),
      {}
    )
  }

  applyStandardIntercepts () {
    // utimens
    //  FUSE supplies times in nano-seconds, but fs wants it in seconds
    this.beforeCall('utimens', async ctx => {
      const [path, atime, mtime] = ctx.args
      ctx.args = [path, atime / 1e9, mtime / 1e9]
    })

    // fgetattr / ftruncate / release - supply path & fd, but fs just wants fd
    const dropPath = async ctx => {
      ctx.args.splice(0, 1)
    }
    this.beforeCall('fgetattr', dropPath)
    this.beforeCall('ftruncate', dropPath)
    this.beforeCall('release', dropPath)

    // fsync - ignore datasync, and just do full fsync
    this.beforeCall('fsync', async ctx => {
      // eslint-disable-next-line no-unused-vars
      const [path, fd, datasync] = ctx.args
      ctx.args = [fd]
    })

    // open - decode flags
    this.beforeCall('open', async ctx => {
      const [path, flags] = ctx.args
      ctx.args = [path, decodeFlags(flags)]
    })

    // create - set flags
    this.beforeCall('create', async ctx => {
      const [path, mode] = ctx.args
      ctx.args = [path, 'w', mode]
    })

    // read - drop path, zero offset, and bizarre bytes-return
    this.beforeCall('read', async ctx => {
      // eslint-disable-next-line no-unused-vars
      const [path, fd, buf, len, pos] = ctx.args
      ctx.args = [fd, buf, 0, len, pos]
    })
    this.afterCall('read', async ctx => {
      const [err, bytes] = ctx.origResults
      if (!err) ctx.results = [bytes]
    })

    // write - drop path, zero offset, and bizarre bytes-return
    this.beforeCall('write', async ctx => {
      // eslint-disable-next-line no-unused-vars
      const [path, fd, buf, len, pos] = ctx.args
      ctx.args = [fd, buf, 0, len, pos]
    })
    this.afterCall('write', async ctx => {
      const [err, bytes] = ctx.origResults
      if (!err) ctx.results = [bytes]
    })
  }
}

class Operation {
  static create (fs, name) {
    const fsName = name in renames ? renames[name] : name
    if (typeof fs[fsName] !== 'function') return null
    const op = new Operation()
    op.name = name
    op.fsMethod = (...args) =>
      new Promise(resolve =>
        fs[fsName](...args, (...results) => resolve(results))
      )
    op.preIntercepts = []
    op.postIntercepts = []
    op.call = op.call.bind(op)
    return op
  }

  async call (...args) {
    const fuseCallback = args.pop()
    const ctx = {
      name: this.name,
      args,
      origArgs: [...args],
      results: undefined,
      origResults: undefined
    }

    try {
      // preCall intercepts
      for (const intercept of this.preIntercepts) {
        const result = await Promise.resolve(intercept(ctx))
        if (Array.isArray(result)) return fuseCallback(...result)
      }

      ctx.origResults = await this.fsMethod(...ctx.args)
      ctx.results = [...ctx.origResults]
      if (ctx.results[0]) ctx.results[0] = decodeError(ctx.results[0])

      // postCall intercepts
      for (const intercept of this.postIntercepts) {
        await Promise.resolve(intercept(ctx))
      }
      return fuseCallback(...ctx.results)
    } catch (err) {
      return fuseCallback(decodeError(err))
    }
  }
}

function noop () {}

function addCallback (list, cb) {
  if (typeof cb === 'function') list.push(cb)
  return () => {
    const ix = list.indexOf(cb)
    if (~ix) list.splice(ix, 1)
  }
}

function decodeError (err) {
  if (typeof err === 'number') return err
  else if (typeof err === 'string') return fuse.errno(err)
  else if (typeof err !== 'object') return -1
  else if (typeof err.code === 'string') return fuse.errno(err.code)
  else if (typeof err.errno === 'number') return err.errno
  else return -1
}

function decodeFlags (flags) {
  const O_RDONLY = 0
  const O_RDWR = 2
  const O_APPEND = 1024
  const O_EXCL = 128
  const O_CREAT = 64

  if ((flags & 3) === O_RDONLY) return 'r'

  return (
    ((flags & O_CREAT) === 0 ? 'r' : (flags & O_APPEND) !== 0 ? 'a' : 'w') +
    ((flags & O_EXCL) !== 0 ? 'x' : '') +
    ((flags & O_RDWR) !== 0 ? '+' : '')
  )
}
