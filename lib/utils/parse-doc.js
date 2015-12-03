import { ObjectId } from 'mongodb';

export default function parseDoc(doc) {
  for (let field in doc) {
    let value = doc[field];
    let isArray = Array.isArray(value);

    if (!isArray && ObjectId.isValid(`${value}`))
      doc[field] = `${value}`;
    else if (isArray && ObjectId.isValid(`${value[0]}`))
      doc[field] = value.map(v => `${v}`);
  }

  doc.id = `${doc._id}`;
  delete doc._id;

  return doc;
}
