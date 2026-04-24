import { createNIP56ReportTags, createNIP56ReportEvent } from "../nostr-helper-functions";
import { ReportReason } from "@/utils/types/types";

describe("NIP-56 Reporting Helpers", () => {
  const hexPubkey = "50762661d9045df687d7b00fce9d34e2c8f85f1c4e7ab564619d690a618451f2";
  const hexEventId = "81ff5c9aa3f7d1891ced8b24a3aa85d53c613e545464197c36a6e70903332159";
  const sellerPubkey = "6e468422dfb34638c4f03932e54117b35f61765c3b9b47e8ecf6a152d515a45b";
  const relay = "wss://relay.damus.io";

  describe("createNIP56ReportTags", () => {
    it("should construct valid p tags for profiles", () => {
      const tags = createNIP56ReportTags({ type: "profile", pubkey: hexPubkey }, "spam");
      expect(tags).toEqual([["p", hexPubkey, "spam"]]);
    });

    it("should include relay hint when provided for profiles", () => {
      const tags = createNIP56ReportTags(
        { type: "profile", pubkey: hexPubkey, relay },
        "spam"
      );
      expect(tags).toEqual([["p", hexPubkey, "spam", relay]]);
    });

    it("should construct valid e tags for listings when dTag is missing", () => {
      const tags = createNIP56ReportTags(
        { type: "listing", eventId: hexEventId, pubkey: sellerPubkey },
        "illegal"
      );
      expect(tags).toEqual([
        ["e", hexEventId, "illegal"],
        ["p", sellerPubkey, "illegal"],
      ]);
    });

    it("should construct both a and e tags for listings when dTag is provided", () => {
      const dTag = "listing-d-tag";
      const tags = createNIP56ReportTags(
        { type: "listing", eventId: hexEventId, pubkey: sellerPubkey, dTag },
        "illegal"
      );
      expect(tags).toEqual([
        ["a", `30402:${sellerPubkey}:${dTag}`, "illegal"],
        ["e", hexEventId, "illegal"],
        ["p", sellerPubkey, "illegal"],
      ]);
    });

    it("should always include a mandatory p tag with reason when reporting a listing (NIP-56)", () => {
      const tags = createNIP56ReportTags(
        { type: "listing", eventId: hexEventId, pubkey: sellerPubkey },
        "spam"
      );
      expect(tags).toContainEqual(["p", sellerPubkey, "spam"]);
    });

    it("should include relay hint on listing e tag when provided", () => {
      const tags = createNIP56ReportTags(
        { type: "listing", eventId: hexEventId, pubkey: sellerPubkey, relay },
        "nudity"
      );
      expect(tags[0]).toEqual(["e", hexEventId, "nudity", relay]);
    });

    it("should include relay hint on listing a tag when provided", () => {
      const dTag = "listing-d-tag";
      const tags = createNIP56ReportTags(
        { type: "listing", eventId: hexEventId, pubkey: sellerPubkey, dTag, relay },
        "nudity"
      );
      expect(tags[0]).toEqual(["a", `30402:${sellerPubkey}:${dTag}`, "nudity", relay]);
    });

    it("should omit relay hint (no trailing empty string) when relay is not provided", () => {
      const tags = createNIP56ReportTags({ type: "profile", pubkey: hexPubkey }, "spam");
      // Tag should be exactly 3 elements, not 4 with an empty string
      expect(tags[0]).toHaveLength(3);
    });

    it("should throw if pubkey is empty for a profile report", () => {
      expect(() =>
        createNIP56ReportTags({ type: "profile", pubkey: "" }, "spam")
      ).toThrow("pubkey is required");
    });

    it("should throw if eventId is empty for a listing report", () => {
      expect(() =>
        createNIP56ReportTags(
          { type: "listing", eventId: "", pubkey: sellerPubkey },
          "spam"
        )
      ).toThrow("eventId is required");
    });

    it.each<ReportReason>([
      "nudity",
      "malware",
      "profanity",
      "illegal",
      "spam",
      "impersonation",
      "other",
    ])("should accept reason '%s'", (reason) => {
      const tags = createNIP56ReportTags({ type: "profile", pubkey: hexPubkey }, reason);
      expect(tags[0]![2]).toBe(reason);
    });
  });

  describe("createNIP56ReportEvent", () => {
    it("should construct a valid kind 1984 event for a profile report", () => {
      const event = createNIP56ReportEvent(
        { type: "profile", pubkey: hexPubkey },
        "impersonation"
      );

      expect(event.kind).toBe(1984);
      expect(event.tags).toContainEqual(["p", hexPubkey, "impersonation"]);
      expect(event.content).toBe("");
    });

    it("should construct a valid kind 1984 event for a listing report with mandatory p tag", () => {
      const event = createNIP56ReportEvent(
        { type: "listing", eventId: hexEventId, pubkey: sellerPubkey },
        "nudity"
      );

      expect(event.kind).toBe(1984);
      expect(event.tags).toContainEqual(["e", hexEventId, "nudity"]);
      expect(event.tags).toContainEqual(["p", sellerPubkey, "nudity"]);
      expect(event.content).toBe("");
    });

    it("should use both a and e tags for listing when dTag is provided in event creation", () => {
      const dTag = "listing-d-tag";
      const event = createNIP56ReportEvent(
        { type: "listing", eventId: hexEventId, pubkey: sellerPubkey, dTag },
        "nudity"
      );

      expect(event.tags).toContainEqual([
        "a",
        `30402:${sellerPubkey}:${dTag}`,
        "nudity",
      ]);
      expect(event.tags).toContainEqual(["e", hexEventId, "nudity"]);
      expect(event.tags).toContainEqual(["p", sellerPubkey, "nudity"]);
    });

    it("should include an alt tag and description when provided", () => {
      const description = "Custom report reason";
      const event = createNIP56ReportEvent(
        { type: "listing", eventId: hexEventId, pubkey: sellerPubkey },
        "other",
        description
      );

      expect(event.tags).toContainEqual(["alt", description]);
      expect(event.content).toBe(description);
    });

    it("should NOT include an alt tag when no description is provided", () => {
      const event = createNIP56ReportEvent(
        { type: "profile", pubkey: hexPubkey },
        "spam"
      );
      expect(event.tags.find((t) => t[0] === "alt")).toBeUndefined();
    });

    it("should have a valid created_at timestamp", () => {
      const event = createNIP56ReportEvent(
        { type: "profile", pubkey: hexPubkey },
        "spam"
      );
      const now = Math.floor(Date.now() / 1000);
      expect(event.created_at).toBeGreaterThanOrEqual(now - 2);
      expect(event.created_at).toBeLessThanOrEqual(now + 2);
    });
  });
});
