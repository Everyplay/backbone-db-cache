var Promises = require('backbone-promises');
var Model = Promises.Model;
var Collection = Promises.Collection;
var Db = require('backbone-db');
var CacheDb = require('..');

var testModelCache = new CacheDb('testmodel-cache', {namespace: 'aa'});
var TestModel = Model.extend({
  type: 'test',
  url: function() {
    if (this.isNew()) {
      return this.type + 's';
    }
    return this.type + 's/' + this.get(this.idAttribute);
  },
  sync: CacheDb.cachingSync(Db.sync, testModelCache)
});

var anotherModelCache = new CacheDb('anothermodel-cache', {namespace: 'bb'});
var AnotherModel = TestModel.extend({
  type: 'another',
  sync: CacheDb.cachingSync(Db.sync, anotherModelCache)
});

var TestCollection = Collection.extend({
  url: function() {
    'tests';
  },
  model: Model,
  sync: CacheDb.cachingSync(Db.sync)
});

exports.setupDb = function(cb) {
  var db = new Db('caching-test-main-db');
  TestModel.prototype.db = db;
  TestCollection.prototype.db = db;
  this.Model = TestModel;
  this.modelCache = testModelCache;
  this.AnotherModel = AnotherModel;
  this.anotherModelCache = anotherModelCache;
  this.db = db;
  this.Collection = TestCollection;
  cb.call(this);
};

exports.clearDb = function(cb) {
  cb();
};