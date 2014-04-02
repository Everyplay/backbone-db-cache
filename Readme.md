## backbone-db-cache

Provides sync wrapper for caching & LRU cache.

Example:
```javascript

var Db = require('backbone-db');
var CacheDb = require('backbone-db-cache');

var testModelCache = new CacheDb('testmodel-cache');
var TestModel = Model.extend({
  ...
  type: 'footype',
  sync: CacheDb.cachingSync(Db.sync, testModelCache)
});
```
