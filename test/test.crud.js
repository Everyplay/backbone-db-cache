var setup = require('./setup');
var should = require('chai').should();
var sinon = require('sinon');
var when = require('backbone-promises').when;

describe('Caching CRUD', function() {
  var model;
  var another;
  var collection;
  var sandbox;

  before(function(next) {
    sandbox = sinon.sandbox.create();
    var self = this;
    setup.setupDb(function() {
      self.Model = this.Model;
      self.modelCache = this.modelCache;
      self.AnotherModel = this.AnotherModel;
      self.anotherModelCache = this.anotherModelCache;
      self.Collection = this.Collection;
      self.db = this.db;
      next();
    });
  });

  afterEach(function() {
    sandbox.restore();
  });

  it('should save a Model', function() {
    var spy = sandbox.spy(this.modelCache, 'del');
    model = new this.Model({
      title: 'testtitle',
      value: 45,
      id: 1
    });
    return model.save().then(function() {
      spy.called.should.equal(true);
    });
  });

  it('should fail if model is not found', function() {
    var m = new this.Model({
      id: 2
    });
    return m.fetch().then(function() {
      return when.reject('should not be found');
    }, function(err) {
      should.exist(err);
    });
  });

  it('should save AnotherModel', function() {
    var spy = sandbox.spy(this.anotherModelCache, 'del');
    another = new this.AnotherModel({
      title: 'anothertitle',
      value: 46,
      id: 1
    });
    return another.save().then(function() {
      spy.called.should.equal(true);
    });
  });

  it('should cache upon read', function() {
    var spy = sandbox.spy(this.db, 'find');
    var cacheSpy = sandbox.spy(this.modelCache, 'set');
    model = new this.Model({id: model.id});
    return model
      .fetch()
      .then(function() {
        model.get('title').should.equal('testtitle');
        spy.called.should.equal(true);
        cacheSpy.called.should.equal(true);
      });
  });

  it('should find a Model from cache', function() {
    var spy = sandbox.spy(this.db, 'find');
    var cacheSpy = sandbox.spy(this.modelCache, 'get');
    model = new this.Model({id: model.id});
    return model
      .fetch()
      .then(function() {
        model.get('title').should.equal('testtitle');
        spy.called.should.equal(false);
        cacheSpy.called.should.equal(true);
      });
  });

  it('should read AnotherModel from main db', function() {
    var spy = sandbox.spy(this.db, 'find');
    var cacheSpy = sandbox.spy(this.anotherModelCache, 'set');
    another = new this.AnotherModel({id: model.id});
    return another
      .fetch()
      .then(function() {
        another.get('title').should.equal('anothertitle');
        spy.called.should.equal(true);
        cacheSpy.called.should.equal(true);
      });
  });

  it('should find AnotherModel from cache', function() {
    var spy = sandbox.spy(this.db, 'find');
    var cacheSpy = sandbox.spy(this.anotherModelCache, 'get');
    another = new this.AnotherModel({id: model.id});
    return another
      .fetch()
      .then(function() {
        another.get('title').should.equal('anothertitle');
        spy.called.should.equal(false);
        cacheSpy.called.should.equal(true);
      });
  });

  it('should update cache when model is updated', function() {
    var self = this;
    var cacheSpy = sandbox.spy(this.modelCache, 'del');
    model.set('title', 'newtitle');
    return model
      .save()
      .then(function() {
        cacheSpy.called.should.equal(true);
        model = new self.Model({id: model.id});
        return model
          .fetch()
          .then(function() {
            model.get('title').should.equal('newtitle');
          });
      });
  });

  it('should delete model from cache', function(next) {
    this.modelCache.del(model, {}, function(err) {
      next(err);
    });
  });

  it('should use main storage when cache is missed', function() {
    var spy = sandbox.spy(this.db, 'find');
    model = new this.Model({id: model.id});
    return model
      .fetch()
      .then(function() {
        model.get('title').should.equal('newtitle');
        spy.called.should.equal(true);
      });
  });

  it('should skip cache with Collections', function() {
    var collection = new this.Collection();
    return collection
      .fetch()
      .then(function() {
        collection.length.should.equal(1);
      });
  });

  it('should del entry from cache when model is destroyed', function() {
    var cacheSpy = sandbox.spy(this.modelCache, 'del');
    model = new this.Model({id: model.id});
    return model
      .destroy()
      .then(function() {
        cacheSpy.called.should.equal(true);
      });
  });
});