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
      db.close(true, (err) => {
        if (err) {
          return reject(err);
        }

        delete this.db;
        return resolve();
      });
    });
  }

  populate(relationships, doc, sideloaded) {
    _.forOwn(doc, (value, field) => {
      if (!sideloaded[field]) return;

      doc[field] = _.map(sideloaded[field], rel => {
        rel.id = rel._id;
        delete rel._id;

        return rel;
      });

      if (!relationships[field].isMany) {
        doc[field] = doc[field][0];
      }
    });

    return doc;
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
          if (err) {
            return reject(err);
          }

          return resolve(docs);
        });
    });
  }

  find(model, query = {}) {
    const { type, relationships } = model;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);

    return new Promise((resolve, reject) => {
      collection.find(query).toArray((err, docs) => {
        if (err) {
          return reject(err);
        }

        // populate relationships
        let promises = {};
        let idArrays = {};

        _.each(docs, doc => {
          _.forOwn(doc, (ids, field) => {
            const rel = relationships[field];

            if (!rel) return;
            if (!idArrays[field]) idArrays[field] = [];

            return idArrays[field].push(ids);
          });
        });

        _.forOwn(idArrays, (ids, field) => {
          const rel = relationships[field];

          if (!rel) return;

          return promises[field] = this.retrieve(rel.model.type, _.uniq(ids));
        });

        Promise.props(promises).then(sideloaded => {
          return resolve(_.map(docs, doc => {
            doc.id = doc._id;
            delete doc._id;

            return this.populate(relationships, doc, sideloaded);
          }));
        });
      });
    });
  }

  findResource(model, id, query = {}) {
    const { type, relationships } = model;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);
    query._id = new ObjectId(id);

    return new Promise((resolve, reject) => {
      collection.find(query).toArray((err, docs) => {
        if (err) {
          return reject(err);
        }

        // transform id
        let doc = docs[0];
        doc.id = `${doc._id}`;
        delete doc._id;

        // populate relationships
        let promises = {};

        _.forOwn(doc, (ids, field) => {
          const rel = relationships[field];

          if (!rel) return;

          return promises[field] = this.retrieve(rel.model.type, ids);
        });

        Promise.props(promises).then(sideloaded => {
          /*
          _.forOwn(doc, (value, field) => {
            if (!sideloaded[field]) return;

            doc[field] = _.map(sideloaded[field], rel => {
              rel.id = rel._id;
              delete rel._id;

              return rel;
            });

            if (!relationships[field].isMany) {
              doc[field] = doc[field][0];
            }
          });
          */

          return resolve(this.populate(relationships, doc, sideloaded));
        });
      });
    });
  }

  findRelated(model, id, field, query = {}) {
    const type = model.type;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);
    const relationship = model.getRelationship(field);
    const fields = { [field]: 1 };
    query._id = new ObjectId(id);

    return new Promise((resolve, reject) => {
      collection.find(query, fields).toArray((err, docs) => {
        if (err) {
          return reject(err);
        }

        const ids = _.map(docs, doc => doc[field]);
        const related = relationship.related;

        console.log('relationship:');
        console.log(relationship);
        console.log('docs:');
        console.log(docs);
        console.log('ids:');
        console.log(ids);
        delete query._id;

        this.populate(relationship, ids, query).then(relationships => {
          console.log('relationships:')
          console.log(relationships);

          return resolve(relationships);
          /*
          let populateArray = new Set();
          let promiseArray = [];

          _.each(relationships, rel => {
            _.forOwn(rel, (value, key) => {
              if (!related[key]) return;

              populateArray.add({
                [key]: {
                  id: value,
                  type: related[key].type,
                  isMany: related[key].isMany,
                },
              });
            });
          });

          populateArray.forEach((value) => {
            const key = Object.keys(value)[0];
            const obj = value[key];
            const p = this.populate(obj.type, obj.id);

            promiseArray.push(p);
          });

          Promise.all(promiseArray).then(populatedResults => {
            console.log('populatedResults');
            console.log(populatedResults);

            console.log('relationships');
            console.log(relationships);
            return resolve(populatedResults);
            /*
            resolve(_.map(relationships, relationship => {
              relationship.id = relationship._id;
              delete relationship._id;

              return relationship;
            }));

          });
          */
        });
      });
    });
  }

  createResource(model, resource) {
    const type = model.type;
    const name = normalizeCollectionName(type);
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

  updateResource(model, id, update) {
    const type = model.type;
    const name = normalizeCollectionName(type);
    const collection = this.database.collection(name);
    const query = { _id: new ObjectId(id) };

    return new Promise((resolve, reject) => {
      collection.update(query, update, (err, result) => {
        if (err) {
          return reject(err);
        }

        return resolve(result.result.ok && result.result.nModified === 1);
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
        if (err) {
          return reject(err);
        }

        return resolve(result.result.ok && result.result.n === 1);
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

  deleteRelationship(model, id, field, relationships) {
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
        if (err) {
          return reject(err);
        }

        return resolve(result.ok);
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
