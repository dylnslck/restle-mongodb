import { MongoClient, ObjectId } from 'mongodb';
import normalizeCollectionName from './utils/normalize-collection-name';
import _ from 'lodash';
import Promise from 'bluebird';

export default class Adapter {
  constructor(options = {}) {
    if (!options.url) {
      throw new Error('A valid `options.url` was not found.');
    }

    this.url = options.url;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const url = this.url;
      const client = MongoClient;

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
      db.close(true, err => {
        if (err) return reject(err);

        delete this.db;
        return resolve();
      });
    });
  }

  populate(model, doc) {
    const relationships = model.relationships;
    let resource = _.clone(doc);
    let fields = {};

    return new Promise((resolve, reject) => {
      _.forOwn(resource, (value, field) => {
        const relationship = relationships[field];

        if (!relationship) return;

        const { isMany, type } = relationship;
        const collection = normalizeCollectionName(type);

        fields[field] = this.retrieve(collection, value);
      });

      Promise.props(fields)
        .then(results => {
          _.forOwn(results, (value, field) => {
            const relationship = relationships[field];

            if (!relationship) return;

            // FIXME: sloppy way of doing this
            results[field] = relationship.isMany ? value : value[0];
          });

          // merge populated fields
          _.merge(resource, results);

          return resolve(resource);
        })
        .catch(err => {
          return reject(err);
        });
    });
  }

  retrieve(collection, ids = [], query = {}) {
    ids = _.isArray(ids) ? ids : [ids];
    collection = normalizeCollectionName(collection);

    if (!_.isEmpty(ids)) {
      query._id = {
        $in: _.map(ids, id => new ObjectId(`${id}`)),
      };
    }

    return new Promise((resolve, reject) => {
      this.database
        .collection(collection)
        .find(query)
        .toArray((err, docs) => {
          if (err) return reject(err);

          return resolve(_.map(docs, doc => {
            // stringify object ids
            _.forOwn(doc, (value, field) => {
              if (!_.isArray(value) && ObjectId.isValid(`${value}`)) {
                doc[field] = `${value}`;
              }
            });

            doc.id = doc._id;
            delete doc._id;

            return doc;
          }));
        });
    });
  }

  // TODO: implement ids filtering
  find(model, ids = [], query = {}) {
    const type = model.type;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);

    _.forOwn(query, (value, field) => {
      if (model.relationships[field]) {
        query[field] = _.isArray(value)
          ?  _.map(value, v => new ObjectId(v))
          : new ObjectId(value);
      }
    });

    return new Promise((resolve, reject) => {
      collection.find(query).toArray((err, docs) => {
        if (err) return reject(err);

        return resolve(Promise.all(_.map(docs, doc => {
          doc.id = `${doc._id}`;
          delete doc._id;

          return this.populate(model, doc);
        })));
      });
    });
  }

  findResource(model, id) {
    const type = model.type;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);
    const query = { _id: new ObjectId(id) };

    return new Promise((resolve, reject) => {
      collection.findOne(query, (err, doc) => {
        if (err) return reject(err);

        doc.id = `${doc._id}`;
        delete doc._id;

        return resolve(this.populate(model, doc));
      });
    });
  }

  findRelated(model, id, field, query = {}) {
    const type = model.type;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);

    return new Promise((resolve, reject) => {
      this.findResource(model, id)
        .then(resource => {
          const relatedModel = model.relationships[field].model;
          const relationship = resource[field];

          if (_.isArray(relationship)) {
            return resolve(Promise.all(
              _.map(relationship, doc => this.populate(relatedModel, doc)))
            );
          } else {
            return resolve(this.populate(relatedModel, relationship));
          }
        })
        .catch(err => {
          return reject(err);
        });
    });
  }

  createResource(model, resource) {
    const { type, relationships } = model;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);

    // turn stringified object ids into real object ids
    _.forOwn(resource, (value, field) => {
      if (_.isArray(value) && ObjectId.isValid(value[0]) && relationships[field]) {
        resource[field] = _.map(value, v => new ObjectId(v));
      } else if (ObjectId.isValid(value) && relationships[field]) {
        resource[field] = new ObjectId(value);
      }
    });

    return new Promise((resolve, reject) => {
      collection.insert([ resource ], (err, result) => {
        if (err) {
          return reject(err);
        }

        let doc = result.ops[0];
        doc.id = `${doc._id}`;
        delete doc._id;

        return resolve(this.populate(model, doc));
      });
    });
  }

  updateResource(model, id, update) {
    const type = model.type;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);
    const query = { _id: new ObjectId(id) };

    update = { $set: update };

    return new Promise((resolve, reject) => {
      collection.findAndModify(query, [], update, {}, (err, result) => {
        if (err) return reject(err);

        return resolve(result.ok);
      });
    });
  }

  deleteResource(model, id) {
    const type = model.type;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);
    const query = { _id: new ObjectId(id) };

    return new Promise((resolve, reject) => {
      collection.remove(query, (err, result) => {
        if (err) return reject(err);

        return resolve(result.result.ok && result.result.n === 1);
      });
    });
  }

  setRelationship(model, id, field, relationship) {
    const type = model.type;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);
    const query = { _id: new ObjectId(id) };

    relationship = new ObjectId(relationship);
    const update = { $set: { [field]: relationship } };

    return new Promise((resolve, reject) => {
      collection.findAndModify(query, {}, update, (err, result) => {
        if (err) return reject(err);

        return resolve(result.ok);
      });
    });
  }

  appendRelationship(model, id, field, relationships) {
    const type = model.type;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);
    const query = { _id: new ObjectId(id) };

    relationships = _.isArray(relationships) ? relationships : [relationships];
    const relationshipIds = _.map(relationships, relationship => new ObjectId(relationship));

    const update = {
      $push: {
        [field]: {
          $each: relationshipIds,
        },
      },
    };

    return new Promise((resolve, reject) => {
      collection.findAndModify(query, {}, update, (err, result) => {
        if (err) {
          return reject(err);
        }

        return resolve(result.ok);
      });
    });
  }

  deleteRelationship(model, id, field, relationships = []) {
    const type = model.type;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);
    const query = { _id: new ObjectId(id) };

    relationships = _.isArray(relationships) ? relationships : [relationships];
    const relationshipIds = _.map(relationships, relationship => new ObjectId(relationship));

    const update = {
      $pull: {
        [field]: {
          $in: relationshipIds,
        },
      },
    };

    return new Promise((resolve, reject) => {
      collection.findAndModify(query, {}, update, (err, result) => {
        if (err) return reject(err);

        return resolve(result.ok);
      });
    });
  }

  removeRelationship(model, id, field) {
    const type = model.type;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);
    const query = { _id: new ObjectId(id) };

    const update = {
      $unset: { [field]: '' },
    };

    return new Promise((resolve, reject) => {
      collection.findAndModify(query, [], update, {}, (err, result) => {
        if (err) return reject(err);

        return resolve(result.ok);
      });
    });
  }

  replaceRelationship(model, id, field, relationships) {
    const type = model.type;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);
    const query = { _id: new ObjectId(id) };

    const update = {
      $set: {
        [field]: _.map(relationships, relationship => new ObjectId(relationship)),
      },
    };

    return new Promise((resolve, reject) => {
      collection.findAndModify(query, [], update, {}, (err, result) => {
        if (err) return reject(err);

        return resolve(result.ok);
      });
    });
  }

  findRelationship(model, id, field) {
    return new Promise(resolve => {
      this.findResource(model, id).then(resource => resolve(resoure[field]));
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
