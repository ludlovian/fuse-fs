'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var fuse = _interopDefault(require('fuse-bindings'));
var PSwitch = _interopDefault(require('pswitch'));

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
];
const renames = {
  getattr: 'stat',
  utimens: 'utimes',
  fgetattr: 'fstat',
  release: 'close',
  create: 'open'
};
const standardBefores = [
  ['utimens', nanosecondsToSeconds],
  ['fgetattr', dropPath],
  ['ftruncate', dropPath],
  ['release', dropPath],
  ['fsync', ignoreDatasync],
  ['open', openFlags],
  ['create', createFlags],
  ['read', zeroOffset],
  ['write', zeroOffset]
];
const standardAfters = [['read', bytesReturn], ['write', bytesReturn]];
class Method {
  static getMethods (fs) {
    const methods = new Map();
    for (const name of fuseMethods) {
      const fsName = name in renames ? renames[name] : name;
      if (typeof fs[fsName] !== 'function') continue
      const method = new Method();
      method.name = name;
      method.fsMethod = (...args) =>
        new Promise(resolve =>
          fs[fsName](...args, (...results) => resolve(results))
        );
      method.before = [];
      method.after = [];
      methods.set(name, method);
    }
    for (const [name, fn] of standardBefores) {
      if (methods.has(name)) methods.get(name).before.push(fn);
    }
    for (const [name, fn] of standardAfters) {
      if (methods.has(name)) methods.get(name).after.push(fn);
    }
    return methods
  }
  invokeFuse (...args) {
    const fusecb = args.pop();
    this.invoke(...args).then(results => fusecb(...results));
  }
  async invoke (...args) {
    const ctx = {
      name: this.name,
      args,
      origArgs: [...args],
      results: undefined,
      origResults: undefined
    };
    try {
      for (const fn of this.before) {
        const p = fn(ctx);
        if (thenable(p)) await p;
        if (ctx.results) break
      }
      if (!ctx.results) ctx.results = await this.fsMethod(...ctx.args);
      ctx.origResults = [...ctx.results];
      const [err] = ctx.results;
      if (err) ctx.results[0] = decodeError(err);
      for (const fn of this.after) {
        const p = fn(ctx);
        if (thenable(p)) await p;
      }
      return ctx.results
    } catch (err) {
      return [decodeError(err)]
    }
  }
}
function nanosecondsToSeconds (ctx) {
  const [path, atime, mtime] = ctx.args;
  ctx.args = [path, atime / 1e9, mtime / 1e9];
}
function dropPath (ctx) {
  ctx.args.splice(0, 1);
}
function ignoreDatasync (ctx) {
  const [path, fd, datasync] = ctx.args;
  ctx.args = [fd];
}
function openFlags (ctx) {
  const [path, flags] = ctx.args;
  ctx.args = [path, decodeFlags(flags)];
}
function createFlags (ctx) {
  const [path, mode] = ctx.args;
  ctx.args = [path, 'w', mode];
}
function zeroOffset (ctx) {
  const [path, fd, buf, len, pos] = ctx.args;
  ctx.args = [fd, buf, 0, len, pos];
}
function bytesReturn (ctx) {
  const [err, bytes] = ctx.origResults;
  if (!err) ctx.results = [bytes];
}
function thenable (p) {
  return (
    p instanceof Promise ||
    (p && typeof p === 'object' && typeof p.then === 'function')
  )
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
  const O_RDONLY = 0;
  const O_RDWR = 2;
  const O_APPEND = 1024;
  const O_EXCL = 128;
  const O_CREAT = 64;
  if ((flags & 3) === O_RDONLY) return 'r'
  return (
    ((flags & O_CREAT) === 0 ? 'r' : (flags & O_APPEND) !== 0 ? 'a' : 'w') +
    ((flags & O_EXCL) !== 0 ? 'x' : '') +
    ((flags & O_RDWR) !== 0 ? '+' : '')
  )
}

class FuseFS {
  constructor (fs, options = {}) {
    this.options = options;
    this.mountPoint = undefined;
    this.mounted = new PSwitch(false);
    this.operations = Method.getMethods(fs);
    this.fuseOps = {
      ...this.options,
      init: cb => {
        this.mounted.set(true);
        cb(null);
      },
      destroy: cb => {
        this.mounted.set(false);
        cb(null);
      }
    };
    for (const method of this.operations.values()) {
      this.fuseOps[method.name] = method.invokeFuse.bind(method);
    }
  }
  mount (mountPoint) {
    this.mountPoint = mountPoint;
    const _debug = process.env.DEBUG;
    const fuseDebug = /\bfuse\b/i.test(_debug);
    if (!fuseDebug) process.env.DEBUG = '';
    return new Promise((resolve, reject) => {
      fuse.mount(mountPoint, this.fuseOps, err => {
        if (err) return reject(err)
        if (!fuseDebug) process.env.DEBUG = _debug;
        resolve(this.mounted.when(true));
      });
    })
  }
  unmount () {
    return new Promise((resolve, reject) => {
      fuse.unmount(this.mountPoint, err => {
        if (err) return reject(err)
        resolve(this.mounted.when(false));
      });
    })
  }
  before (...args) {
    return addIntercepts(this.operations, 'before', args)
  }
  after (...args) {
    return addIntercepts(this.operations, 'after', args)
  }
  async invoke (name, ...args) {
    const method = this.operations.get(name);
    if (!method) return [-1]
    return method.invoke(...args)
  }
}
function addIntercepts (ops, type, args) {
  const methods = args.filter(x => typeof x === 'string');
  const fns = args.filter(x => typeof x === 'function');
  const undos = [];
  for (const method of methods) {
    for (const fn of fns) {
      if (ops.has(method)) {
        const list = ops.get(method)[type];
        list.push(fn);
        undos.push(() => {
          const ix = list.indexOf(fn);
          if (~ix) list.splice(ix, 1);
        });
      }
    }
  }
  return () => undos.forEach(fn => fn())
}

module.exports = FuseFS;
