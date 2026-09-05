import { useCallback, useEffect, useRef } from "react"
import { useDialKitController, type DialConfig } from "dialkit"

type ImportHandlers = {
  applyCommunityEngine: (url: string) => void | Promise<void>
  resetDefaultEngine: () => void
  uploadModel: () => void
  applySketchfabModel: (url: string) => void | Promise<void>
  resetDefaultModel: () => void
}

const ENGINE_CATALOG_URL = "https://catalog.engine-sim.parts/parts?sort=downloads"
const SKETCHFAB_CAR_SEARCH_URL = "https://sketchfab.com/search?category=cars-vehicles&features=downloadable&licenses=322a749bcfa841b29dff1e8a1bb74b0b&licenses=b9ddc40b93e34cdca1fc152f39b9f375&licenses=72360ff1740d419791934298b8b6d270&licenses=bbfe3f7dbcdd4122b966b85b9786a989&licenses=2628dbe5140a4e9592126c8df566c0b7&licenses=34b725081a6a4184957efaec2cb84ed3&licenses=7c23a1ba438d4306920229c12afcb5f9&licenses=72eb2b1960364637901eacce19283624&type=models"

const openBrowseTab = (url: string) => {
  const link = document.createElement("a")
  link.href = url
  link.target = "_blank"
  link.rel = "noopener noreferrer"
  link.click()
}

const config = {
  communityEngine: {
    catalogUrl: { type: "text", default: "", placeholder: "https://catalog.engine-sim.parts/parts/2953" },
    browseEngines: { type: "action", label: "Browse Popular Engines" },
    applyEngine: { type: "action", label: "Apply Engine to Current Car" },
    resetEngine: { type: "action", label: "Reset to Default Engine" },
  },
  carModel: {
    uploadModel: { type: "action", label: "Upload GLB / glTF / ZIP" },
    sketchfabUrl: { type: "text", default: "", placeholder: "https://sketchfab.com/3d-models/..." },
    browseSketchfab: { type: "action", label: "Browse Downloadable Cars" },
    applySketchfab: { type: "action", label: "Sign In & Apply Sketchfab Model" },
    resetModel: { type: "action", label: "Reset to Default Model" },
    modelYawDegrees: [180, -180, 180, 1],
    modelScale: [1, 0.25, 3, 0.05],
  },
  importStatus: { type: "text", default: "Ready", placeholder: "Import status" },
} satisfies DialConfig

export function useImportControls(handlers: ImportHandlers) {
  const handlersRef = useRef(handlers)
  const controllerRef = useRef<ReturnType<typeof useDialKitController<typeof config>> | null>(null)

  const controller = useDialKitController("Imports", config, {
    id: "torque-zero-imports",
    onAction: (path) => {
      const values = controllerRef.current?.getValues()
      if (!values) return
      if (path === "communityEngine.browseEngines") openBrowseTab(ENGINE_CATALOG_URL)
      if (path === "communityEngine.applyEngine") void handlersRef.current.applyCommunityEngine(values.communityEngine.catalogUrl)
      if (path === "communityEngine.resetEngine") {
        handlersRef.current.resetDefaultEngine()
        controllerRef.current?.setValue("communityEngine.catalogUrl", "")
      }
      if (path === "carModel.uploadModel") handlersRef.current.uploadModel()
      if (path === "carModel.browseSketchfab") openBrowseTab(SKETCHFAB_CAR_SEARCH_URL)
      if (path === "carModel.applySketchfab") {
        void handlersRef.current.applySketchfabModel(values.carModel.sketchfabUrl)
      }
      if (path === "carModel.resetModel") {
        handlersRef.current.resetDefaultModel()
        controllerRef.current?.setValue("carModel.sketchfabUrl", "")
      }
    },
  })

  useEffect(() => {
    handlersRef.current = handlers
    controllerRef.current = controller
  }, [controller, handlers])

  const setValue = controller.setValue
  const setStatus = useCallback((status: string) => setValue("importStatus", status), [setValue])
  const resetCurrentVersion = useCallback(() => {
    controller.setValues({
      communityEngine: { catalogUrl: "" },
      carModel: { sketchfabUrl: "", modelYawDegrees: 180, modelScale: 1 },
      importStatus: "Ready",
    })
  }, [controller])

  return {
    values: controller.values,
    setStatus,
    resetCurrentVersion,
  }
}
