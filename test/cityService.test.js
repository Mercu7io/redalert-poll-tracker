const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const cityService = require('../src/services/cityService');

describe('CityService', () => {
    it('loads cities from bundled cities.json correctly', () => {
        const count = cityService.getTotalCount();
        assert.ok(count > 1000, `Expected over 1000 cities, got ${count}`);
    });

    it('finds cities by English name and Hebrew name', () => {
        const telAviv = cityService.getCityByName('Tel Aviv - City Center');
        assert.ok(telAviv);
        assert.equal(telAviv.name, 'תל אביב - מרכז העיר');
        assert.equal(telAviv.countdown, 90);

        const ashkelon = cityService.getCityByName('אשקלון - דרום');
        assert.ok(ashkelon);
        assert.equal(ashkelon.nameEn, 'Ashkelon - South');
        assert.equal(ashkelon.countdown, 30);
    });

    it('searches cities with prefix and substring matching', () => {
        const results = cityService.search('ashk', 5);
        assert.ok(results.length > 0);
        assert.ok(results.some(c => c.nameEn.toLowerCase().includes('ashkelon')));

        const hebrewResults = cityService.search('חיפה', 5);
        assert.ok(hebrewResults.length > 0);
        assert.ok(hebrewResults.some(c => c.name.includes('חיפה')));
    });

    it('handles unknown or empty city searches gracefully (edge cases)', () => {
        const notFound = cityService.getCityByName('NonExistentCityXYZ');
        assert.equal(notFound, null);

        const nullCity = cityService.getCityByName(null);
        assert.equal(nullCity, null);

        const defaultResults = cityService.search('');
        assert.ok(defaultResults.length > 0);
    });
});
