import { Redactor } from '../src/evidence/Redactor';

describe('Redactor', () => {
    const redactor = new Redactor();

    test('Redacts emails', () => {
        const input = "Contact me at user@example.com for info.";
        const { redacted, check } = redactor.process(input);
        
        expect(redacted).not.toContain("user@example.com");
        expect(redacted).toContain("[REDACTED-EMAIL]");
        expect(check.hasChanges).toBe(true);
    });

    test('Redacts IPv4 addresses', () => {
        const input = "Server IP is 192.168.1.55 connected.";
        const { redacted, check } = redactor.process(input);

        expect(redacted).not.toContain("192.168.1.55");
        expect(redacted).toContain("[REDACTED-IP]");
        expect(check.hasChanges).toBe(true);
    });

    test('Ignores safe text', () => {
        const input = "This is a safe string.";
        const { redacted, check } = redactor.process(input);

        expect(redacted).toBe(input);
        expect(check.hasChanges).toBe(false);
    });
});
