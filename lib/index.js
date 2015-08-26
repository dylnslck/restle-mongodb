import mongodb from 'mongodb';
import inflect from 'i';
import _ from 'lodash';

export default class Adapter {
  constructor(options = {}) {
    if (!options.url) {
      throw new Error('A valid `options.url` was not found.');
    }

    this.url = options.url;
    this.client = mongodb.MongoClient;
  }

  static normalizeCollectionName(type) {
    const i = inflect();
    return i.pluralize(type.toLowerCase());
  }

  connect() {
    return new Promise((resolve, reject) => {
      const url = this.url;
      const client = mongodb.MongoClient;

      client.connect(url, (err, db) => {
        if (err) {
          return reject(err);
        }

        this.database = db;
        return resolve();
      });
    });
  }

  disconnect() {
    const db = this.database;

    return new Promise((resolve, reject) => {
      db.close(true, (err) => {
        if (err) {
          return reject(err);
        }

        delete this.db;
        return resolve();
      });
    });
  }

  find(type, query = {}) {
    const name = Adapter.normalizeCollectionName(type);
    const collection = this.database.collection(name);

    return new Promise((resolve, reject) => {
      collection.find(query).toArray((err, docs) => {
        if (err) {
          return reject(err);
        }

        return resolve(_.map(docs, doc => {
          doc.id = doc._id;
          delete doc._id;
          return doc;
        }));
      });
    });
  }

  findResource(type, id) {
    const name = Adapter.normalizeCollectionName(type);
    const collection = this.database.collection(name);
    const query = { _id: new mongodb.ObjectId(id) };

    return new Promise((resolve, reject) => {
      collection.find(query).toArray((err, docs) => {
        if (err) {
          return reject(err);
        }

        let doc = docs[0];
        doc.id = `${doc._id}`;
        delete doc._id;

        return resolve(doc);
      });
    });
  }

  createResource(type, resource) {
    const name = Adapter.normalizeCollectionName(type);
    const collection = this.database.collection(name);

    return new Promise((resolve, reject) => {
      collection.insert([resource], (err, result) => {
        if (err) {
          return reject(err);
        }

        let doc = result.ops[0];
        doc.id = `${doc._id}`;
        delete doc._id;

        return resolve(doc);
      });
    });
  }

  updateResource(type, id, update) {
    const name = Adapter.normalizeCollectionName(type);
    const collection = this.database.collection(name);
    const query = { _id: new mongodb.ObjectId(id) };

    return new Promise((resolve, reject) => {
      collection.update(query, update, (err, result) => {
        if (err) {
          return reject(err);
        }

        return resolve(result.result.ok && result.result.nModified === 1);
      });
    });
  }

  deleteResource(type, id) {
    const name = Adapter.normalizeCollectionName(type);
    const collection = this.database.collection(name);
    const query = { _id: new mongodb.ObjectId(id) };

    return new Promise((resolve, reject) => {
      collection.remove(query, (err, result) => {
        if (err) {
          return reject(err);
        }

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
