// Only the explicit localhost development demo may render the old application.
export function legacyDemoEnabled() {
  return (
    process.env.NODE_ENV === "development" && process.env.SOAP_LEGACY === "true"
  );
}
