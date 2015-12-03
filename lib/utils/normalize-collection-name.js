import inflect from 'i';

export default function normalizeCollectionName(type) {
  const i = inflect();

  return i.pluralize(type.toLowerCase());
}
