/**
 * Advanced Validators for Marketplace Events (NIP-30402)
 */

export function validateListing(event) {
    if (event.kind !== 30402) return { valid: false, errors: ['Not a 30402 event'] };

    const tags = event.tags || [];
    const d = tags.find(t => t[0] === 'd')?.[1];
    const title = tags.find(t => t[0] === 'title')?.[1];
    const priceTag = tags.find(t => t[0] === 'price'); // [price, <amount>, <currency>, <frequency>?]
    const image = tags.find(t => t[0] === 'image')?.[1];

    const errors = [];
    if (!d) errors.push('Missing d-tag (identifier)');
    if (!title) errors.push('Missing title');
    if (!priceTag) errors.push('Missing price tag');

    // Check for expiration
    const expiration = tags.find(t => t[0] === 'expiration')?.[1];
    if (expiration && parseInt(expiration) < Math.floor(Date.now() / 1000)) {
        errors.push('Listing expired');
    }

    return {
        valid: errors.length === 0,
        errors,
        metadata: {
            d,
            title,
            price: priceTag ? { amount: priceTag[1], currency: priceTag[2] } : null,
            hasImage: !!image,
            isExpired: !!expiration && parseInt(expiration) < Math.floor(Date.now() / 1000)
        }
    };
}

export function scoreSearchRelevance(event, query) {
    const content = (event.content || '').toLowerCase();
    const tags = (event.tags || []).flat().join(' ').toLowerCase();
    const searchable = `${content} ${tags}`;

    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    if (terms.length === 0) return 1.0;

    let hits = 0;
    for (const term of terms) {
        if (searchable.includes(term)) hits++;
    }

    return hits / terms.length;
}

export function analyzeSearchPrecision(events, query) {
    if (events.length === 0) return { averagePrecision: 0, perfectMatches: 0, garbageRatio: 0 };

    const scores = events.map(e => scoreSearchRelevance(e, query));
    const averagePrecision = scores.reduce((a, b) => a + b, 0) / (events.length || 1);

    return {
        averagePrecision,
        perfectMatches: scores.filter(s => s === 1.0).length,
        garbageRatio: scores.filter(s => s < 0.2).length / (events.length || 1)
    };
}
