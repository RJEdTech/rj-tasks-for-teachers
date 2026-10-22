# Deploying RJ Tasks for Teachers

Same path as RJ Tasks for Students, but pushed to **faculty** devices, not student devices.

1. **Publish** to Microsoft Edge Add-ons as **Hidden**, under the Regis Jesuit publisher account. Use the submission kit: package, listing text and screenshots.
2. When certification passes, copy the **extension ID** from the listing URL.
3. In **Intune**, create a settings catalog policy: Microsoft Edge > Extensions > *Control which extensions are installed silently* (`ExtensionInstallForcelist`), with the value

   `<extension-id>;https://edge.microsoft.com/extensionwebstorebase/v1/crx`

   Assign it to the **faculty/staff** device or user group only.
4. Pilot with a few volunteer teachers first, then widen the assignment.

Updates: upload a new version in Partner Center. Edge updates installed copies on its own after certification. Teachers never need Developer mode.

To check the extension on a machine without the store listing, use `edge://extensions` > Developer mode > Load unpacked, pointing at the unzipped build. Do this on your own computer only.
