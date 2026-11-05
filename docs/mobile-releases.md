# Elixir Clinic mobile releases

The CRM header shares one public `/app-download` link. The page offers Android and iPhone installers. Clinic access still uses the app's existing staff sign-in.

## Publish an installer

Run EAS from `apps/mobile` using the existing `@mkz-solutions/elixir-clinic` project.

| Platform | Pilot | Production |
| --- | --- | --- |
| Android | `eas build --platform android --profile preview` | `eas build --platform android --profile production` |
| iPhone | `eas build --platform ios --profile testflight`, then submit that build to TestFlight | `eas build --platform ios --profile production`, then submit for Apple review |

Keep the Android release keystore and application ID for every staff APK. Host the signed production APK at a public HTTPS URL. Use the approved Apple install link for iPhone.

Set the deployed CRM's environment variables as follows.

- `NEXT_PUBLIC_CRM_APP_ORIGIN` is the permanent HTTPS origin encoded in the QR.
- `CRM_ANDROID_APK_URL` and `CRM_IOS_INSTALL_URL` are the public installer destinations.
- `CRM_ANDROID_BUILD` and `CRM_IOS_BUILD` are the integer Android version code and iOS build number of the installers currently available at those URLs. Set each number only after the corresponding installer is available.

Deploy the web changes and verify the page from a signed-out phone. Leave a platform's variables empty until its installer is available.

If publishing through Git, set the verified platform's `url` and `build` in `src/lib/mobile-releases.json` and deploy the web commit. A valid installer URL set through the environment overrides the corresponding entry.

## Publish compatible updates

Use `eas update --channel preview --environment preview --platform android --message "Describe the fix"` to test an Android update on a matching preview build. Use the same backend environment as the build, and verify the runtime fingerprint before promoting. Run the command from a clean checkout without local generated native directories. Publish validated production updates to the `production` channel with the `production` environment. Use Apple review for changes that introduce or change app functionality on iPhone.

Check that the installed app offers a restart, that **Más tarde** leaves the app usable, and that restarting preserves the session. Test upgrades from the previous signed binary and verify that the release metadata points at the new installer. Use a new binary whenever the runtime fingerprint changes.
