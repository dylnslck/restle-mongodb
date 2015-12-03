import { AdapterError } from 'restle-error';

export default function adapterError(reason) {
  const type = 'MongoDB';

  return new AdapterError({ type, reason });
}
