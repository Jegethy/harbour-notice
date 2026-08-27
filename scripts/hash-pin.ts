/**
 * Print a scrypt hash for a PIN, for setting the first one by hand.
 *
 *   npm run hash:pin -- 4821
 *
 * Then paste it into the SQL editor:
 *   select set_swap_pin('<the hash>');
 *
 * The admin panel is the normal way to set a PIN. This exists for the chicken
 * and egg at the very start — and for the day somebody has locked themselves
 * out of a tablet and needs a PIN set without a browser to hand.
 */
import { hashPin, isValidPinShape } from "../src/lib/board/unlock";

const pin = process.argv[2];

if (!pin || !isValidPinShape(pin)) {
  console.error("Usage: npm run hash:pin -- 1234   (exactly four digits)");
  process.exit(1);
}

hashPin(pin).then((hash) => {
  console.log(hash);
  console.log("\nRun this in the Supabase SQL editor:");
  console.log(`  select set_swap_pin('${hash}');`);
});
