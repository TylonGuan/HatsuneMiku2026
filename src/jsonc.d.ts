// .jsonc files are imported as raw strings (webpack `asset/source`) and parsed
// at runtime, since JSON-with-comments isn't valid JSON.
declare module "*.jsonc" {
  const content: string;
  export default content;
}
