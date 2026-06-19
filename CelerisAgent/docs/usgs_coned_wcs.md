# USGS CoNED WCS Source Notes

Purpose:

- Tier 2 default US coastal DEM source when the user does not specify a particular dataset, or when a specified Tier 1 dataset is unavailable or not downloadable.
- Preferred before NOAA Sea Level Rise Viewer DEM because CoNED is a high-resolution topobathymetric DEM product family.
- Implemented module: `agent.sources.coned_wcs`

Service:

- CoNED Project Viewer: `https://topotools.cr.usgs.gov/topobathy_viewer/`
- GeoServer WCS endpoint: `https://dmsdata.cr.usgs.gov/geoserver/wcs`

Tested request pattern:

```text
GET https://dmsdata.cr.usgs.gov/geoserver/wcs?
  SERVICE=WCS
  REQUEST=GetCoverage
  VERSION=2.0.1
  CoverageId=<coverage_id>
  format=image/tiff
  subset=X(<min_x>,<max_x>)
  subset=Y(<min_y>,<max_y>)
```

Example verified coverage:

- Layer name from viewer: `topo:CentCA_Topobathy_DEM_1m`
- WCS coverage id from `DescribeCoverage`: `topo__CentCA_Topobathy_DEM_1m`

Workflow:

1. Match the AOI against a cached CoNED viewer layer catalog.
2. For the selected layer, call `DescribeCoverage` directly. Avoid full WCS `GetCapabilities` during normal requests because it can be slow.
3. Read the coverage CRS, bounds, offset vectors, native format, and service-native grid spacing.
4. Estimate native/service-native grid dimensions from the requested domain and service grid spacing.
5. If the request exceeds `CELERIS_MAX_NATIVE_SOURCE_CELLS` or the default 10,000,000-cell safety limit, do not call `GetCoverage`; return a confirmation/review response with the estimated grid size.
6. Transform the AOI bbox into the coverage CRS.
7. Call `GetCoverage` with AOI `subset=X(...)` and `subset=Y(...)`.
8. Save the returned GeoTIFF under the job `downloads/` or `work/` folder.
9. Route the GeoTIFF through the normal DEM loading, validation, and `celeris_bathy.mat` export path.

Metadata requirements:

- Store WCS endpoint, layer name, coverage id, request URL, coverage CRS, coverage bounds, source/service grid spacing, output GeoTIFF path, vertical datum if known, and source resolution type.
- Use `source_resolution_type: service_native` when the WCS coverage is served in a web/service CRS or grid spacing that may differ from the archive bundle's original product grid.
- Use `source_resolution_type: archive_native` only when the script has verified that the WCS grid matches the original archive product projection and spacing.
- Preserve the source vertical datum as supplied by metadata. CoNED archive products are generally NAVD88 with vertical units in meters, but individual service layers should still be checked and recorded.

Fallback behavior:

- If no CoNED coverage intersects the AOI, route to `noaa_slr_viewer_dem_search`.
- If `DescribeCoverage` succeeds but `GetCoverage` fails or returns a non-raster error payload, save the error payload in `work/`, mark the CoNED attempt as failed, and route to NOAA SLR.
- If the native-resolution request is too large, stop at the CoNED tier and ask for user confirmation or a smaller AOI rather than falling through to other sources silently.
- If the user explicitly requested CoNED and CoNED fails, tell the user that the requested source failed before continuing to the next tier.
