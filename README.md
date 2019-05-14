# fuse-fs
Mount a tweakable fs-like with FUSE

## Background

Uses [fuse-bindings](https://github.com/mafintosh/fuse-bindings) to mount an `fs`-like object via FUSE.

Differs from [fs-fuse](https://github.com/piranna/fs-fuse) in that:
- calls can be intercepted and tweaked to adjust behaviour
- does not try to provide full support
- uses `Promise`, `async`

Written for my own use.

## API

### FuseFS

`const fuseFs = new FuseFS(fsLike[, options])`

creates a FuseFS object from the `fs`-like object. Options are passed
to `fuse-bindings`

### .mount

`await fuseFS.mount(mountPoint)`

mounts the FuseFS object at the mount point. Returns a promise of the fact that it mounted

### .unmount

`await fuseFS,unmount`

unmounts the FuseFS object, returning a promise of the fact.

### .beforeCall

`fuseFS.beforeCall(methodName, interceptFunction)`

adds an intercept for a FUSE method before the underlying fs method is called.
The intercept function is call with a context object with the following
keys:
- name - the FUSE method being called
- args - the args it was called with (as adjusted by any earlier intercept)
- origArgs - the original args it was called with, before any intercepts

The function must return a promise (e.g. an async function)

| returned `Promise` | behaviour |
| --- | --- |
| `Array` of values | The fs method will be skipped, and the returned array used as the parameters for the FUSE callback. No further intercepts will be called |
| rejected with `Error` | The FUSE method will be reported as having failed. A string `.code` will be decoded into the right FUSE error number |
| anything else | The FUSE call continues, using the `args` (which you may have adjusted) and calling the underlying fs method |

The `beforeCall` method returns a function which can be called to remove the intercept

Intercepts are called in the order they are defined

### .afterCall

`fuseFS.afterCall(methodName, interceptFunction)`

adds an intercept for a FUSE method after the underlying fs method has been made.
Receives a context object with the following keys:
- name - the FUSE method called
- args - the args actually sent to the fs method
- origArgs - the original args (before any `beforeCall` intercepts applied)
- results - the array of results (usually [error, result]). Possibly as modified by any earlier intercepts
- origResults - the array of results from theunderlying fs method before any other `afterCall` intercepts

You can adjust the `results` array here. The FUSE callback will be called on resolution/rejection of this promise.

If the intercept throws, then the error will be decoded and used as the FUSE callback result. No
other intercepts will be called.

The `afterCall` returns a function will can remove this intercept.

Intercepts are called in the order they are defined.

### .pathAdjust

`fuseFS.pathAdjust(pathAdjustor)`

A modified intercept which allows you to adjust paths (e.g. to implement a union or redirection scheme).

The `pathAdjustor` function should return a `Promise` of a revised path to use, and recevies the following params:
- path - the path given to the FUSE function
- name - the name of the method being called (e.g. `getattr` or `readdir`)
- num - the 0-based index of the parameter (so you know if this is the from- or to- path of a `rename` for example)

If the promise rejects, then the appropriate error will be sent on to FUSE.

`pathAdjust` returns a function to remove the pathAdjustor

### .on

`off = fuseFs.on(methodName, callback)`

adds a notify callback to be called after each FUSE call. The callback is called with a single object with the
following keys:
- name - the FUSE method name
- args - the args, as modified by all intercepts
- result - the result array as modified by all intercepts

Do not linger in this callback.

It returns an unsubscription function
