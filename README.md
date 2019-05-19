# fuse-fs
A tweakable fs-like that can be mounted via FUSE

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

### .before

`fuseFS.before(method[, method...], function[, function...])`

adds _before_ intercepts for the specified methods. Returns a function to remove them.

### .after

`fuseFS.after(method[, method...], function[, function...])`

adds _after_ intercepts for the specified methods. Returns a function to remove them.

### Intercepts

Intercept functions are called in the order they are specified. The _before_ ones are called before the call (duh!),
and the _after_ ones after the call.

They all take one parameter, and are `await`ed, so can be `async`. The parameter is a context object with the following:  
- `name` - the FUSE name of the method being called
- `origArgs[]` - the original args called (before any intercepts)
- `args[]` - the args that will be used to make the call. Can be modified by _before_ intercepts.
- `origResults[]` - the original results from the call (before any _after_ intercepts)
- `results[]` - the results of the call to be sent back to the called. Can be modified by _after_ intercepts

`results` and `origResults` will be `undefined` for any _before_ intercepts. If however, an intercept sets `results` then no
call will be made to the fs-like, and instead it will be passed on to the chain of _after_ intercepts.

Return values of intercept functions are ignored. Any changes must be made to the context object.

### .invoke

`const [err, results] = await fuseFS.invoke(method, ...args)`

Invokes a FUSE callback - with the chains of intercepts - and resolves to the array of values that would be sent back to FUSE 
