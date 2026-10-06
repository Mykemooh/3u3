import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromSearchBox } from '@/components/AddressInput';

test('Search Box suggestions become street / city / state / ZIP, never coordinates', () => {
  const s = fromSearchBox({
    name: '1234 Main Street',
    mapbox_id: 'dXJuOm1ieGFkcjo',
    feature_type: 'address',
    context: {
      address: { name: '1234 Main Street' },
      postcode: { name: '77494' },
      place: { name: 'Katy' },
      region: { name: 'Texas', region_code: 'TX' },
    },
    coordinates: { latitude: 29.7, longitude: -95.8 },
  });
  assert.deepEqual(s, { id: 'dXJuOm1ieGFkcjo', label: '1234 Main Street, Katy, TX 77494', line1: '1234 Main Street', city: 'Katy', state: 'TX', zip: '77494', source: 'searchbox' });
  assert.ok(!JSON.stringify(s).includes('29.7'));
  assert.equal(fromSearchBox({ name: 'Katy', mapbox_id: 'x', context: { region: { region_code: 'TX' } } }), null, 'a city alone is not an address');
});
