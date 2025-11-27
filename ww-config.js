export default {
  editor: {
    label: {
      en: "MechLytix Viewer",
    },
  },
  properties: {
    // 1. The Color Picker (Keep this so you can still style it)
    donutColor: {
      label: {
        en: "Shape Color",
      },
      type: "Color",
      defaultValue: "#FF6600",
      bindable: true, /* Critical: Allows you to bind this to data */
    },
    
    // 2. The File Input (This is the new part for Spike 005)
    fileUrl: {
      label: {
        en: "File URL",
      },
      type: "Text", /* We treat the file path as a simple text string */
      defaultValue: "",
      bindable: true, /* Critical: Allows you to bind this to the File Uploader element */
      section: "settings",
    },
  },
};