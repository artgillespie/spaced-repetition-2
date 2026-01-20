import { describe, test, expect } from "bun:test";
import { parseHashcards } from "../src/import/hashcards";

describe("Hashcards Parser", () => {
  describe("Q/A cards", () => {
    test("parses simple Q/A card", () => {
      const input = `Q: What is 2+2?
A: 4`;

      const { cards, errors } = parseHashcards(input);
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toBe("What is 2+2?");
      expect(cards[0].back).toBe("4");
      expect(errors).toHaveLength(0);
    });

    test("parses multiple Q/A cards separated by blank lines", () => {
      const input = `Q: Question 1
A: Answer 1

Q: Question 2
A: Answer 2`;

      const { cards, errors } = parseHashcards(input);
      expect(cards).toHaveLength(2);
      expect(cards[0].front).toBe("Question 1");
      expect(cards[0].back).toBe("Answer 1");
      expect(cards[1].front).toBe("Question 2");
      expect(cards[1].back).toBe("Answer 2");
      expect(errors).toHaveLength(0);
    });

    test("parses cards separated by ---", () => {
      const input = `Q: Question 1
A: Answer 1
---
Q: Question 2
A: Answer 2`;

      const { cards, errors } = parseHashcards(input);
      expect(cards).toHaveLength(2);
    });

    test("parses multi-line Q/A content", () => {
      const input = `Q: List the primary colors.
A:
- Red
- Blue
- Yellow`;

      const { cards, errors } = parseHashcards(input);
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toBe("List the primary colors.");
      expect(cards[0].back).toBe("- Red\n- Blue\n- Yellow");
    });

    test("handles case insensitive Q:/A:", () => {
      const input = `q: lowercase question
a: lowercase answer`;

      const { cards, errors } = parseHashcards(input);
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toBe("lowercase question");
      expect(cards[0].back).toBe("lowercase answer");
    });

    test("reports error for Q without A", () => {
      const input = `Q: Question without answer`;

      const { cards, errors } = parseHashcards(input);
      expect(cards).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("missing A:");
    });
  });

  describe("Cloze cards", () => {
    test("parses simple cloze card", () => {
      const input = `C: The [mitochondria] is the powerhouse of the cell.`;

      const { cards, errors } = parseHashcards(input);
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toBe("The [...] is the powerhouse of the cell.");
      expect(cards[0].back).toBe("The mitochondria is the powerhouse of the cell.");
    });

    test("parses cloze with multiple deletions", () => {
      const input = `C: [Paris] is the capital of [France].`;

      const { cards, errors } = parseHashcards(input);
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toBe("[...] is the capital of [...].");
      expect(cards[0].back).toBe("Paris is the capital of France.");
    });

    test("handles multi-line cloze", () => {
      const input = `C:
The quick [brown] fox
jumps over the [lazy] dog.`;

      const { cards, errors } = parseHashcards(input);
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toContain("[...]");
      expect(cards[0].back).toContain("brown");
      expect(cards[0].back).toContain("lazy");
    });

    test("reports error for cloze without deletions", () => {
      const input = `C: No brackets here.`;

      const { cards, errors } = parseHashcards(input);
      expect(cards).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("no [deletions]");
    });
  });

  describe("Mixed content", () => {
    test("parses mixed Q/A and cloze cards", () => {
      const input = `Q: What is 2+2?
A: 4

C: The [mitochondria] is the powerhouse of the cell.

Q: What color is the sky?
A: Blue`;

      const { cards, errors } = parseHashcards(input);
      expect(cards).toHaveLength(3);
      expect(cards[0].front).toBe("What is 2+2?");
      expect(cards[1].front).toBe("The [...] is the powerhouse of the cell.");
      expect(cards[2].front).toBe("What color is the sky?");
    });

    test("reports error for unknown format", () => {
      const input = `Q: Valid card
A: Valid answer

This is random text without Q: or C:

Q: Another valid card
A: Another answer`;

      const { cards, errors } = parseHashcards(input);
      expect(cards).toHaveLength(2);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("Unknown format");
    });
  });

  describe("Edge cases", () => {
    test("handles empty input", () => {
      const { cards, errors } = parseHashcards("");
      expect(cards).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });

    test("handles whitespace-only input", () => {
      const { cards, errors } = parseHashcards("   \n\n   ");
      expect(cards).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });

    test("handles Windows line endings", () => {
      const input = "Q: Question\r\nA: Answer";
      const { cards, errors } = parseHashcards(input);
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toBe("Question");
    });

    test("trims whitespace from content", () => {
      const input = `Q:   Padded question
A:   Padded answer   `;

      const { cards } = parseHashcards(input);
      expect(cards[0].front).toBe("Padded question");
      expect(cards[0].back).toBe("Padded answer");
    });
  });
});
