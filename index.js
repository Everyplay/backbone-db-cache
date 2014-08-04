var _ = require('lodash');
var debug = require('debug')('backbone-db-cache');
var Backbone = require('backbone');
var LRU = require('lru-cache');
var defaultOptions = {
  max: 500,
  maxAge: 1000 * 60 // default to 1 minute
};

var CacheDb = function CacheDb(name, options) {
  this.name = name;
  this.options = _.extend({}, defaultOptions, options);
  this.queue = {};
  this.cache = LRU(this.options);
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
    debug('cache set (%s):', this.name, key);
    this.cache.set(key, _.clone(modelAttrs));
    cb(null, modelAttrs);
  },

  get: function(model, options, cb) {
    var key = this._getKey(model);
    debug('cache get (%s):', this.name, key);
    var res = _.clone(this.cache.get(key));
    if (res) {
      debug('cache hit (%s):', this.name, key);
    } else {
      debug('cache miss (%s):', this.name, key);
    }
    cb(null, res);
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
    options = options || {};

    function callback(err, res, resp) {
      if ((err && options.error) || (!err && !res && options.error)) {
        err = err || new Error('not found');
        return options.error(err, resp);
      } else if (options.success && res) {
        return options.success(res, resp);
      }
    }

    function cacheSet(modelAttrs, resp) {
      cache.set(modelAttrs, options, callback);
    }

    function cacheGet(model, options, cb) {
      cache.get(model, options, cb);
    }

    function cacheDel(model, options, cb) {
      cache.del(model, options, cb);
    }

    function isReading(model) {
      return cache.queue[model.url()] !== undefined;
    }

    function queueReadCallback(model, callback) {
      var murl = model.url();
      cache.queue[murl] = cache.queue[murl] || [];
      cache.queue[murl].push(callback);
    }

    function handleReadQueue(model, res, resp) {
      var murl = model.url();
      var callbacks = cache.queue[murl];
      delete cache.queue[murl];
      _.each(callbacks, function(cb) {
        cb(null, res, resp);
      });
    }

    function resetReadQueue(model) {
      cache.queue[model.url()] = [];
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
          opts.success = function(res, resp) {
            var error;
            cache.set(res, options, function() {
              handleReadQueue(model, res, resp);
              callback(null, res, resp);
            });
          };
        if (typeof model.get(model.idAttribute) !== 'undefined') {
          if (isReading(model)) {
            queueReadCallback(model, callback);
            return;
          }
          cacheGet(model, options, function(err, cachedRes) {
            if (err) return callback(err);
            if (cachedRes) {
              return callback(null, cachedRes);
            }
            resetReadQueue(model);
            return wrappedSync(method, model, _.extend({}, options, opts));
          });
        } else {
          // caching collections is not implemented yet
          opts.success = function(res, resp) {
            _.each(res, function(m) {
              cache.set(m, options, function() { });
            });
            callback(null, res, resp);
          };
          return wrappedSync(method, model, _.extend({}, options, opts));
        }
    }
  };
};

CacheDb.cachingSync = cachingSync;
module.exports = CacheDb;