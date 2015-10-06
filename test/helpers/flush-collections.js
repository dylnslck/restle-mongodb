import Promise from 'bluebird';
import { Collection } from 'mongodb';

export default function flushCollections(assert, db, done) {
  const collections = {
    people: db.collection('people'),
    animals: db.collection('animals'),
    companies: db.collection('companies'),
    habitats: db.collection('habitats'),
    buildings: db.collection('buildings'),
    countries: db.collection('countries'),
  };

  Promise.promisify(Collection);

  Promise.all([
    collections.people.remove(),
    collections.animals.remove(),
    collections.companies.remove(),
    collections.habitats.remove(),
    collections.buildings.remove(),
    collections.countries.remove(),
  ])

  .then(success => {
    assert.ok(success, 'successfully flushed collections');
    done();
  })

  .catch(errors => {
    assert.fail(errors, 'no errors removing collections');
  });
}
