var _ = require('lodash');
var debug = require('debug')('backbone-db-cache');
var Backbone = require('backdash');
var LRU = require('lru-cache');
var defaultOptions = {
  max: 1000,
  maxAge: 1000 * 60 // default to 1 minute
};

var CacheDb = function CacheDb(name, options) {
  this.name = name;
  this.options = _.extend({}, defaultOptions, options);
  this.queue = {};
  this.cache = new LRU(this.options);
};

_.extend(CacheDb.prototype, Backbone.Events, {
  _getKey: function(modelAttrs) {
    var separator = ':';
    var vals = [
      this.options.namespace,
      modelAttrs.id
    ];
    return _.without(vals, undefined).join(separator);
  },

  set: function (modelAttrs, options, cb) {
    var key = this._getKey(modelAttrs);
    debug('cache set (%s): %s %o', this.name, key);
    this.cache.set(key, _.clone(modelAttrs));
    if(cb) cb(null, modelAttrs);
  },

  get: function(model, options, cb) {
    var key = this._getKey(model);
    debug('cache get (%s): %s', this.name, key);
    var res = this.cache.get(key);
    //res = res && JSON.parse(res);
    if (res) {
      debug('cache hit (%s): %s: %o', this.name, key, res);
    } else {
      debug('cache miss (%s): %s', this.name, key);
    }
    if(cb) cb(null, _.clone(res));
    return res;
  },

  has: function(modelAttrs) {
    var key = this._getKey(modelAttrs);
    return this.cache.has(key);
  },

  del: function(modelAttrs, options, cb) {
    var key = this._getKey(modelAttrs);
    debug('cache del', key);
    this.cache.del(key);
    cb(null, modelAttrs);
  }
});

var cachingSync = function(wrappedSync, cache) {
  return function sync(method, model, options) {
    var now = Date.now();
    options = options || {};

    function callback(err, res, resp) {
      if ((err && options.error) || (!err && !res && options.error)) {
        err = err || new Error('not found');
        return options.error(err, resp);
      } else if (options.success && res) {
        return options.success(res, resp);
      }
    }

    function cacheSet(modelAttrs, resp, cb) {
      cache.set(modelAttrs, options, (cb || callback));
    }

    function cacheGet(model, options, cb) {
      cache.get(model, options, cb);
    }

    function cacheDel(model, options, cb) {
      cache.del(model, options, cb);
    }

    function isReading(model) {
      var murl = model.url();
      debug('queue isReading %s %s', murl, cache.queue[model.url()] !== undefined);
      return cache.queue[model.url()] !== undefined;
    }

    function queueReadCallback(model, callback) {
      var murl = model.url();
      debug('queue read callback for %s', murl);
      cache.queue[murl] = cache.queue[murl] || [];
      cache.queue[murl].push(callback);
    }

    function handleReadQueue(model, error, res, resp) {
      var murl = model.url();
      var callbacks = cache.queue[murl];
      debug('handle read queue for %s with %s items', murl, callbacks.length);
      resetReadQueue(model);
      _.each(callbacks, function(cb) {
        cb(error, res, resp);
      });
    }

    function initReadQueue(model) {
      var murl = model.url();
      debug('init read queue for %s', murl);
      cache.queue[murl] = cache.queue[murl] || [];
    }

    function resetReadQueue(model) {
      delete cache.queue[model.url()];
    }

    var opts = {
      error: callback
    };
    switch (method) {
      case 'create':
      case 'update':
        cacheDel(model, options, function(err, cachedRes) {
          if (err) return callback(err);
          return wrappedSync(method, model, options);
        });
        break;
      case 'delete':
        cacheDel(model, options, function(err, cachedRes) {
          if (err) return callback(err);
          return wrappedSync(method, model, options);
        });
        break;
      case 'read':
        if (typeof model.get(model.idAttribute) !== 'undefined') {
          cacheGet(model, options, function(err, cachedRes) {
            if (err) {
              return callback(err);
            }
            if (cachedRes) {
              return callback(null, cachedRes);
            }
           if (isReading(model)) {
              queueReadCallback(model, callback);
              return;
            }
            initReadQueue(model);
            var now = Date.now();
            opts.success = function(res, resp) {
              var error;
              var url = model.url();
              debug('model fetch took %s ms', Date.now() - now);
              cacheSet(res, options, function(err) {
                callback(null, res, resp);
                handleReadQueue(model, err, res, resp);
              });
            };
            opts.error = function(err, res) {
                callback(err, res);
                handleReadQueue(model, err, res);
            };

            return wrappedSync(method, model, _.extend({}, options, opts));
          });
        } else {
          // caching collections is not implemented yet
          opts.success = function(res, resp) {
            var results = res;
            if(results) {
              if(!_.isArray(results)) {
                results = [results];
              }
              _.each(results, function(m) {
                debug('Caching %o',m);
                if (!cache.has(m)) {
                  cache.set(m, options);
                }
              });
            }

            callback(null, res, resp);
          };
          return wrappedSync(method, model, _.extend({}, options, opts));
        }
    }
  };
};

CacheDb.cachingSync = cachingSync;
module.exports = CacheDb;
