# NOAA Digital Coast DAV Source Notes

The NOAA Digital Coast Data Access Viewer is available at:

- `https://coast.noaa.gov/dataviewer/#/`

The current DAV web app calls a JSON API under:

- `https://coast.noaa.gov/dataviewer/api/v1`

Implemented prototype node:

- `POST /search/missions`
- Tier 1 user-specified dataset search through `agent.sources.noaa_dav.retrieve_user_specified_dav_dataset`
- NOAA SLR Tier 2 fallback through `agent.sources.noaa_dav.retrieve_noaa_slr_dem`
- Payload shape:

```json
{
  "aoi": "SRID=4269;POLYGON((min_lon min_lat,min_lon max_lat,max_lon max_lat,max_lon min_lat,min_lon min_lat))",
  "published": "true",
  "dataTypes": ["Lidar", "DEM"],
  "dialect": "arcgis"
}
```

Useful fields returned in each feature:

- `ID`, `Name`, `DataType`, `DataTypeID`
- `CellSizeM`, `Resolution`
- `NativeVdatum`, `TideControlled`, `Vertical_Accuracy`
- `ImageService_Server`, `ImageService_Service`
- `ExternalProviderLink`, which often contains DAV custom download, metadata, bulk download, EPT, or report links.

Retrieval branches:

- If `ImageService_Server` and `ImageService_Service` are present, the prototype can call `<image_service_url>/exportImage` and request a GeoTIFF for the AOI.
- Before `exportImage`, estimate the native-resolution grid dimensions. If the request exceeds `CELERIS_MAX_NATIVE_SOURCE_CELLS` or the default 10,000,000-cell safety limit, do not start the export; return a confirmation/review response with the estimated grid size.
- If no image service is present but bulk links exist, the current prototype records the links but does not tile/subset them automatically.
- If only full-product/provider links are available for a user-specified dataset, `noaa_dav_full_dataset_download` should download the full dataset after informing the user of estimated size and likely wait time.
- If only DAV custom download is available, the current prototype records that limitation; it does not submit asynchronous checkout requests.

Tier 1 DAV dataset selection policy:

- Use DAV first only when the user specifies a particular US dataset/source name or asks for a specific high-resolution US source.
- For user-specified Tier 1 searches, include both `DEM` and `Lidar` candidates. Match the user's requested name against DAV candidate names, provider names, and external provider metadata.
- If the matched candidate is downloadable, download it even if AOI extraction is unavailable and the full dataset must be pulled. Before starting a large download, tell the user the estimated size and that it may take time.
- If the matched candidate is a raster DEM, route it through DEM standardization.
- If the matched candidate is lidar/point-cloud data, store the downloaded files and metadata, then mark the branch as source data only. Do not claim `celeris_bathy.mat` exists until a raster DEM has been produced and standardized.
- If the requested DAV dataset is not found or is not downloadable, explain that result and continue to Tier 2 unless the user explicitly says not to use alternate sources.
- Do not use lidar candidates as default substitutes when the user did not specify them.
- Download in the selected source's native vertical datum and native/source resolution where available. Do not request datum conversion during the prototype source download branch. Store the native or service-native resolution in job state, source retrieval metadata, and the DEM manifest.
- CoNED and NOAA Sea Level Rise Viewer DEM are not the DAV default path anymore. Default no-source US requests should try USGS CoNED WCS first, then NOAA Sea Level Rise Viewer DEM, then public NOAA gridded sources.

For the Santa Cruz Wharf 1 km by 1 km test AOI, DAV currently returns multiple candidates, including:

- `2020 San Mateo RCD Lidar DEM: Santa Cruz County, CA`
- `NOAA Sea Level Rise Viewer DEM`
- USACE and California topobathy DEM products

For default Santa Cruz requests with no user-specified dataset, the graph should try USGS CoNED WCS before NOAA Sea Level Rise Viewer DEM. DAV remains useful when the user names one of the high-resolution DAV datasets or when a DAV ImageServer provides a direct raster export.
