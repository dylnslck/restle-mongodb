import { MongoClient, ObjectId } from 'mongodb';
import { NotFoundError } from 'restle-error';
import normalizeCollectionName from './utils/normalize-collection-name';
import parseDoc from './utils/parse-doc';
import adapterError from './utils/adapter-error';
import _ from 'lodash';
import Promise from 'bluebird';

// currently required methods: find, populate, retrieve, findRecord, create, update, delete.
export default class Adapter {
  constructor(options = {}) {
    if (!('url' in options))
      return Promise.reject(adapterError('url is undefined.'));

    this.url = options.url;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const url = this.url;
      const client = MongoClient;

      client.connect(url, (err, db) => {
        if (err)
          return reject(adapterError(err.message));

        this.database = db;
        return resolve(this);
      });
    });
  }

  disconnect() {
    const db = this.database;

    return new Promise((resolve, reject) => {
      db.close(true, err => {
        if (err)
          return reject(adapterError(err.message));

        delete this.db;
        return resolve();
      });
    });
  }

  populate(model, data) {
    const { relationships } = model;
    const record = _.clone(data);
    let relatedAdapter, relatedModel;

    for (let field in record) {
      if (!(field in relationships))
        continue;

      relatedModel = relationships[field].model;
      relatedAdapter = relatedModel.adapter;
      record[field] = relatedAdapter.retrieve(relatedModel, record[field]);
    }

    return Promise.props(record);
  }

  retrieve(model, ids) {
    const query = {};
    const isMany = Array.isArray(ids) || undefined === ids;
    const collection = normalizeCollectionName(model.type);

    ids = undefined !== ids && (isMany ? ids : [ ids ]);

    if (ids.length) {
      query._id = {
        $in: ids.map(id => new ObjectId(`${id}`)),
      };
    }

    return new Promise((resolve, reject) => {
      this.database
        .collection(collection)
        .find(query)
        .toArray((err, docs) => {
          if (err)
            return reject(adapterError(err.message));

          const records = docs.map(doc => parseDoc(doc));
          return resolve(isMany ? records : records[0]);
        });
    });
  }

  find(model, options = {}) {
    const type = model.type;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);

    const fields = {};
    const query = {};

    if ('ids' in options) {
      query._id = {
        $in: ids.map(id => new ObjectId(`${id}`)),
      };
    }

    if ('fields' in options) {
      for (let field in options.fields) {
        fields[field] = Number(options.fields[field]);
      }
    }

    if ('filter' in options)
      Object.assign(query, options.filter);

    // FIXME: reduce callback hell with better promises
    return new Promise((resolve, reject) => {
      collection.count(query, (err, count) => {
        if (err)
          return reject(adapterError(err.message));

        const find = collection.find(query, fields);

        if ('sort' in options) {
          let sort = {};

          for (let field in options.sort)
            sort[field] = options.sort[field] === 'desc'
              ? -1 : 1;

          find.sort(sort);
        }

        if ('page' in options) {
          if ('offset' in options.page)
            find.skip(options.page.offset);

          if ('limit' in options.page)
            find.limit(options.page.limit);
        }

        find.toArray((err, docs) => {
          if (err)
            return reject(adapterError(err.message));

          Promise.all(docs.map(doc => {
            doc.id = `${doc._id}`;
            delete doc._id;

            return this.populate(model, doc);
          })).then(records => {
            records.count = count;
            return resolve(records);
          });
        });
      });
    });
  }

  findRecord(model, id) {
    const type = model.type;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);

    if (!ObjectId.isValid(id))
      return Promise.reject(adapterError('invalid ObjectId'));

    const query = { _id: new ObjectId(id) };

    return new Promise((resolve, reject) => {
      collection.findOne(query, (err, doc) => {
        if (err)
          return reject(adapterError(err.message));

        if (!doc)
          return reject(new NotFoundError({ type, id }));

        doc.id = `${doc._id}`;
        delete doc._id;

        return resolve(this.populate(model, doc));
      });
    });
  }

  create(model, resource) {
    const { type, relationships } = model;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);

    for (let field in resource) {
      let value = resource[field];

      if (Array.isArray(value) && ObjectId.isValid(value[0] && relationships[field]))
        resource[field] = value.map(v => new ObjectId(v));

      if (ObjectId.isValid(value) && relationships[field])
        resource[field] = new ObjectId(value);
    }

    return new Promise((resolve, reject) => {
      collection.insert([ resource ], (err, result) => {
        if (err)
          return reject(adapterError(err.message));

        let doc = result.ops[0];
        doc.id = `${doc._id}`;
        delete doc._id;

        return resolve(this.populate(model, doc));
      });
    });
  }

  update(model, id, update) {
    const type = model.type;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);

    if (!ObjectId.isValid(id))
      return Promise.reject(adapterError('invalid ObjectId'));

    const query = { _id: new ObjectId(id) };

    update = { $set: update };

    // TODO: NotFoundError when record not found
    return new Promise((resolve, reject) => {
      collection.findAndModify(query, [], update, { new: true }, (err, result) => {
        if (err)
          return reject(adapterError(err.message));

        if (!result.ok)
          return reject(adapterError('attempted to update non-existing record'));

        const doc = parseDoc(result.value);
        return resolve(this.populate(model, doc));
      });
    });
  }

  delete(model, id) {
    const type = model.type;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);

    if (!ObjectId.isValid(id))
      return Promise.reject(adapterError('invalid ObjectId'));

    const query = { _id: new ObjectId(id) };

    // TODO: NotFoundError when record not found
    return new Promise((resolve, reject) => {
      collection.remove(query, (err, result) => {
        if (err)
          return reject(adapterError(err.message));

        if (!result.result.ok)
          return reject(adapterError('attempted to delete non-existing record'));

        return resolve(result.result.ok && result.result.n === 1);
      });
    });
  }

  get database() {
    const db = this.db;

    if (!db) {
      throw new Error('Database must be connected before invoking `delete`.');
    }

    return db;
  }

  set database(db) {
    this.db = db;
  }
}
