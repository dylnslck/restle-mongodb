import mongodb from 'mongodb';
import _ from 'lodash';

export default class Adapter {
  constructor(options = {}) {
    if (!options.url) {
      throw new Error('A valid `options.url` was not found.');
    }

    this.url = options.url;
    this.client = mongodb.MongoClient;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const url = this.url;
      const client = mongodb.MongoClient;

      client.connect(url, (err, db) => {
        if (err) {
          return reject(err);
        }

        this.db = db;
        return resolve();
      });
    });
  }

  disconnect() {
    const db = this.db;

    return new Promise((resolve, reject) => {
      if (!db) {
        return reject(new Error('No database object found.'));
      }

      this.db.close(true, (err) => {
        if (err) {
          return reject(err);
        }

        delete this.db;
        return resolve();
      });
    });
  }

  find(type, query = {}) {
    const db = this.db;

    if (!db) {
      throw new Error('Database must be connected before invoking `find`.');
    }

    const collection = db.collection(type);

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

  findOne(type, id) {
    const db = this.db;

    if (!db) {
      throw new Error('Database must be connected before invoking `findOne`.');
    }

    const collection = db.collection(type);
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

  create(type, resource) {
    const db = this.db;

    if (!db) {
      throw new Error('Database must be connected before invoking `create`.');
    }

    const collection = db.collection(type);

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

  update(type, id, update) {
    const db = this.db;

    if (!db) {
      throw new Error('Database must be connected before invoking `update`.');
    }

    const collection = db.collection(type);
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

  delete(type, id) {
    const db = this.db;

    if (!db) {
      throw new Error('Database must be connected before invoking `delete`.');
    }

    const collection = db.collection(type);
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
}
