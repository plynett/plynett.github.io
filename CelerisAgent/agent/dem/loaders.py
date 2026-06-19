from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np

from agent.dem.types import DemGrid
from agent.io_utils import extract_zip


SUPPORTED = {".tif", ".tiff", ".asc", ".grd", ".txt", ".csv", ".xyz", ".nc", ".cdf", ".mat", ".npy", ".npz"}


class DemLoadError(RuntimeError):
    pass


def expand_inputs(paths: list[Path], work_dir: Path) -> list[Path]:
    expanded: list[Path] = []
    for path in paths:
        if path.suffix.lower() == ".zip":
            expanded.extend(extract_zip(path, work_dir / "extracted"))
        else:
            expanded.append(path)
    return expanded


def load_first(paths: list[Path], options: dict) -> tuple[DemGrid, list[str]]:
    candidates = [p for p in paths if p.suffix.lower() in SUPPORTED]
    priority = {".tif": 0, ".tiff": 0, ".nc": 1, ".cdf": 1, ".asc": 2, ".grd": 2, ".mat": 3, ".npy": 4, ".npz": 4}
    candidates.sort(key=lambda p: (priority.get(p.suffix.lower(), 9), p.name.lower()))
    errors: list[str] = []
    for path in candidates:
        try:
            grid, node = load_one(path, options)
            grid.source_files.append(str(path))
            return grid, ["detect_attachment_format", node]
        except Exception as exc:
            errors.append(f"{path.name}: {exc}")
    if not candidates:
        raise DemLoadError("No supported DEM file was found in the uploaded attachments.")
    raise DemLoadError("; ".join(errors))


def load_one(path: Path, options: dict) -> tuple[DemGrid, str]:
    suffix = path.suffix.lower()
    if suffix in {".tif", ".tiff"}:
        return load_geotiff(path), "load_geotiff"
    if suffix in {".asc", ".grd"}:
        return load_ascii_grid(path), "load_ascii_grid"
    if suffix in {".txt", ".csv", ".xyz"}:
        return load_text(path), "load_text_or_xyz"
    if suffix in {".nc", ".cdf"}:
        return load_netcdf(path, options), "load_netcdf"
    if suffix == ".mat":
        return load_mat(path), "load_mat"
    if suffix in {".npy", ".npz"}:
        return load_numpy(path), "load_numpy"
    raise DemLoadError(f"Unsupported extension: {suffix}")


def load_geotiff(path: Path) -> DemGrid:
    import rasterio

    with rasterio.open(path) as ds:
        z = ds.read(1).astype(np.float32)
        if ds.nodata is not None:
            z = np.where(z == ds.nodata, np.nan, z)
        dtypes = [str(value) for value in ds.dtypes]
        colorinterp = [interp.name for interp in ds.colorinterp]
        units = [value for value in ds.units]
        transform = ds.transform
        grid = DemGrid(
            z=z,
            dx=abs(float(transform.a)) if transform.a else None,
            dy=abs(float(transform.e)) if transform.e else None,
            x0=float(transform.c),
            y0=float(transform.f),
            crs=ds.crs.to_string() if ds.crs else None,
        )
        grid.metadata["geotiff"] = {
            "band_count": ds.count,
            "dtypes": dtypes,
            "color_interpretation": colorinterp,
            "descriptions": list(ds.descriptions),
            "units": units,
            "tags": dict(ds.tags()),
            "nodata": ds.nodata,
            "likely_image": is_likely_image_geotiff(ds.count, dtypes, colorinterp, units),
        }
        if any(unit and unit.lower() in {"meter", "metre", "meters", "metres", "m"} for unit in units):
            grid.z_units = "meters"
        grid.add_history("load_geotiff", file=path.name, band_count=ds.count, dtypes=dtypes, color_interpretation=colorinterp)
        return grid


def is_likely_image_geotiff(band_count: int, dtypes: list[str], colorinterp: list[str], units: list[str | None]) -> bool:
    color_names = {name.lower() for name in colorinterp}
    if band_count >= 3 and {"red", "green", "blue"}.issubset(color_names):
        return True
    if band_count >= 3 and all(dtype.lower().startswith(("uint8", "uint16")) for dtype in dtypes):
        return True
    if band_count in {3, 4} and not any(units):
        return True
    return False


def load_ascii_grid(path: Path) -> DemGrid:
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    header: dict[str, float] = {}
    data_start = 0
    for idx, line in enumerate(lines[:20]):
        parts = line.strip().split()
        if len(parts) < 2:
            continue
        key = parts[0].lower()
        if key in {"ncols", "nrows", "xllcorner", "yllcorner", "xllcenter", "yllcenter", "cellsize", "nodata_value"}:
            header[key] = float(parts[1])
            data_start = idx + 1
    required = {"ncols", "nrows", "cellsize"}
    if not required.issubset(header):
        raise DemLoadError("Missing ESRI ASCII grid header fields.")
    z = np.loadtxt(lines[data_start:], dtype=np.float32)
    expected = (int(header["nrows"]), int(header["ncols"]))
    if z.shape != expected:
        raise DemLoadError(f"ASCII grid shape mismatch: expected {expected}, got {z.shape}")
    nodata = header.get("nodata_value")
    if nodata is not None:
        z = np.where(z == nodata, np.nan, z)
    dx = float(header["cellsize"])
    x0 = header.get("xllcorner", header.get("xllcenter"))
    yll = header.get("yllcorner", header.get("yllcenter"))
    y0 = float(yll + (expected[0] - 1) * dx) if yll is not None else None
    grid = DemGrid(z=z, dx=dx, dy=dx, x0=x0, y0=y0)
    grid.add_history("load_ascii_grid", file=path.name)
    return grid


def load_text(path: Path) -> DemGrid:
    arr = None
    for delimiter in (None, ",", ";", "\t"):
        try:
            candidate = np.genfromtxt(path, delimiter=delimiter, comments="#", dtype=np.float64)
            if candidate.size and np.isfinite(candidate).any():
                arr = candidate
                break
        except Exception:
            pass
    if arr is None:
        raise DemLoadError("Could not parse numeric text.")
    arr = np.asarray(arr)
    if arr.ndim == 2 and arr.shape[1] == 3 and arr.shape[0] > 3:
        return xyz_to_grid(arr, path)
    if arr.ndim == 2 and arr.shape[0] >= 2 and arr.shape[1] >= 2:
        grid = DemGrid(z=arr.astype(np.float32))
        grid.add_history("load_text_or_xyz", file=path.name, interpretation="2D matrix")
        return grid
    raise DemLoadError(f"Unsupported numeric text shape: {arr.shape}")


def xyz_to_grid(arr: np.ndarray, path: Path) -> DemGrid:
    arr = arr[np.all(np.isfinite(arr), axis=1)]
    xvals = np.unique(arr[:, 0])
    yvals = np.unique(arr[:, 1])
    if xvals.size * yvals.size != arr.shape[0]:
        raise DemLoadError("XYZ points do not form a complete regular grid.")
    xvals.sort()
    yvals.sort()
    y_desc = yvals[::-1]
    xi = {float(v): i for i, v in enumerate(xvals)}
    yi = {float(v): i for i, v in enumerate(y_desc)}
    z = np.full((y_desc.size, xvals.size), np.nan, dtype=np.float32)
    for x, y, elev in arr:
        z[yi[float(y)], xi[float(x)]] = elev
    grid = DemGrid(
        z=z,
        x=xvals,
        y=y_desc,
        dx=float(np.nanmedian(np.diff(xvals))) if xvals.size > 1 else None,
        dy=float(np.nanmedian(np.diff(yvals))) if yvals.size > 1 else None,
        x0=float(xvals[0]),
        y0=float(y_desc[0]),
    )
    grid.add_history("load_text_or_xyz", file=path.name, interpretation="XYZ regular grid")
    return grid


def load_netcdf(path: Path, options: dict) -> DemGrid:
    import xarray as xr

    variable = (options.get("variable") or "").strip()
    with xr.open_dataset(path) as ds:
        if variable:
            if variable not in ds:
                raise DemLoadError(f"NetCDF variable not found: {variable}")
            da = ds[variable]
        else:
            da = None
            for name, candidate in ds.data_vars.items():
                if np.issubdtype(candidate.dtype, np.number) and candidate.ndim >= 2:
                    da = candidate
                    variable = name
                    break
            if da is None:
                raise DemLoadError("No numeric 2D variable found.")
        if da.ndim > 2:
            da = da.isel({dim: 0 for dim in da.dims[:-2]})
        z = np.asarray(da.values, dtype=np.float32)
        y_dim, x_dim = da.dims[-2], da.dims[-1]
        x = np.asarray(ds[x_dim].values, dtype=np.float64) if x_dim in ds.coords else None
        y = np.asarray(ds[y_dim].values, dtype=np.float64) if y_dim in ds.coords else None
        grid = DemGrid(z=z, x=x, y=y, crs=ds.attrs.get("crs") or ds.attrs.get("spatial_ref"))
        grid.infer_spacing()
        if x is not None and x.size:
            grid.x0 = float(x[0])
        if y is not None and y.size:
            grid.y0 = float(y[0])
        grid.metadata["netcdf_variable"] = variable
        grid.add_history("load_netcdf", file=path.name, variable=variable)
        return grid


def load_mat(path: Path) -> DemGrid:
    from scipy.io import loadmat

    data = loadmat(path, squeeze_me=True, struct_as_record=False)
    celeris_bathy = data.get("celeris_bathy")
    z_value, z_name = first_mat_array(data, celeris_bathy, ["h", "z", "Z", "bathy", "depth", "elevation"], ndim=2)
    if z_value is None:
        names = [k for k in data if not k.startswith("__")]
        z_value, z_name = first_mat_array(data, celeris_bathy, names, ndim=2)
    if z_value is not None:
        z = np.asarray(z_value, dtype=np.float32)
        x, y, axis_source, transposed = mat_primary_axes(data, celeris_bathy, z)
        if transposed:
            z = z.T
        lon, lat = mat_geographic_axes(data, celeris_bathy, z.shape)
        if x is None or y is None:
            x = lon
            y = lat
            axis_source = "lon_lat" if lon is not None and lat is not None else axis_source
        grid = DemGrid(z=z, x=x, y=y, lon=lon, lat=lat)
        grid.infer_spacing()
        if grid.x is not None and grid.x.size:
            grid.x0 = float(grid.x[0])
        if grid.y is not None and grid.y.size:
            grid.y0 = float(grid.y[0])
        if grid.lon is not None and grid.lat is not None:
            grid.crs = "EPSG:4326"
            grid.metadata["coordinate_mapping"] = {
                "type": "axis_aligned_geographic",
                "x_axis": "x",
                "y_axis": "y",
                "lon_axis": "lon",
                "lat_axis": "lat",
                "convention": "matrix rows map to y/lat and columns map to x/lon, matching MATLAB pcolor(x,y,h)",
            }
        grid.vertical_datum = first_mat_text(data, celeris_bathy, ["vertical_datum", "vdatum", "datum"]) or None
        grid.z_units = first_mat_text(data, celeris_bathy, ["z_units", "units"]) or grid.z_units
        grid.metadata["mat"] = {
            "z_variable": z_name,
            "axis_source": axis_source,
            "transposed_to_match_axes": transposed,
            "available_variables": sorted(k for k in data if not k.startswith("__")),
        }
        grid.add_history(
            "load_mat",
            file=path.name,
            variable=z_name,
            axis_source=axis_source,
            transposed_to_match_axes=transposed,
        )
        return grid
    raise DemLoadError("No 2D numeric array found in MATLAB file.")


def first_mat_array(data: dict[str, Any], struct: Any, names: list[str], ndim: int | None = None) -> tuple[Any, str | None]:
    for name in names:
        value = mat_value(data, struct, name)
        if isinstance(value, np.ndarray) and value.size and np.issubdtype(value.dtype, np.number):
            arr = np.asarray(value)
            if ndim is None or arr.ndim == ndim:
                return value, name
    return None, None


def first_mat_text(data: dict[str, Any], struct: Any, names: list[str]) -> str | None:
    for name in names:
        value = mat_value(data, struct, name)
        if value is None:
            continue
        if isinstance(value, np.ndarray):
            value = value.squeeze()
            if value.size != 1:
                continue
            value = value.item()
        text = str(value).strip()
        if text:
            return text
    return None


def mat_value(data: dict[str, Any], struct: Any, name: str) -> Any:
    if name in data:
        return data[name]
    if struct is not None and hasattr(struct, name):
        return getattr(struct, name)
    return None


def mat_primary_axes(data: dict[str, Any], struct: Any, z: np.ndarray) -> tuple[np.ndarray | None, np.ndarray | None, str | None, bool]:
    x = first_axis(data, struct, ["x", "X"], z, "x", allow_transposed=True)
    y = first_axis(data, struct, ["y", "Y"], z, "y", allow_transposed=True)
    aligned = align_axes_to_matrix(z, x, y, "x_y")
    if aligned[0] is not None and aligned[1] is not None:
        return aligned
    lon = first_axis(data, struct, ["lon", "longitude", "Longitude", "LON"], z, "x", allow_transposed=True)
    lat = first_axis(data, struct, ["lat", "latitude", "Latitude", "LAT"], z, "y", allow_transposed=True)
    return align_axes_to_matrix(z, lon, lat, "lon_lat")


def mat_geographic_axes(data: dict[str, Any], struct: Any, shape: tuple[int, int]) -> tuple[np.ndarray | None, np.ndarray | None]:
    rows, cols = shape
    lon = first_vector_by_size(data, struct, ["lon", "longitude", "Longitude", "LON"], cols)
    lat = first_vector_by_size(data, struct, ["lat", "latitude", "Latitude", "LAT"], rows)
    if lon is not None and lat is not None:
        return lon, lat
    return None, None


def first_vector_by_size(data: dict[str, Any], struct: Any, names: list[str], size: int) -> np.ndarray | None:
    for name in names:
        value = mat_value(data, struct, name)
        if value is None:
            continue
        arr = np.asarray(value, dtype=np.float64).squeeze()
        if arr.ndim == 1 and arr.size == size:
            return arr
    return None


def first_axis(data: dict[str, Any], struct: Any, names: list[str], z: np.ndarray, axis: str, allow_transposed: bool = False) -> np.ndarray | None:
    expected = z.shape[1] if axis == "x" else z.shape[0]
    alternate = z.shape[0] if axis == "x" else z.shape[1]
    for name in names:
        value = mat_value(data, struct, name)
        axis_values = axis_vector(value, expected, z.shape, axis, alternate if allow_transposed else None)
        if axis_values is not None:
            return axis_values
    return None


def axis_vector(value: Any, expected: int, z_shape: tuple[int, int], axis: str, alternate: int | None = None) -> np.ndarray | None:
    if value is None:
        return None
    arr = np.asarray(value, dtype=np.float64).squeeze()
    if arr.ndim == 1 and arr.size == expected:
        return arr
    if alternate is not None and arr.ndim == 1 and arr.size == alternate:
        return arr
    if arr.ndim == 2 and arr.shape == z_shape:
        return arr[0, :] if axis == "x" else arr[:, 0]
    return None


def align_axes_to_matrix(
    z: np.ndarray,
    x: np.ndarray | None,
    y: np.ndarray | None,
    source: str | None,
) -> tuple[np.ndarray | None, np.ndarray | None, str | None, bool]:
    rows, cols = z.shape
    if x is not None and y is not None and x.size == cols and y.size == rows:
        return x, y, source, False
    if x is not None and y is not None and x.size == rows and y.size == cols:
        return x, y, source, True
    return None, None, None, False


def load_numpy(path: Path) -> DemGrid:
    if path.suffix.lower() == ".npy":
        z = np.load(path)
    else:
        archive = np.load(path)
        z = None
        for name in ("z", "bathy", "depth", "elevation", *archive.files):
            if name in archive and archive[name].ndim == 2:
                z = archive[name]
                break
        if z is None:
            raise DemLoadError("No 2D array found in NPZ file.")
    grid = DemGrid(z=np.asarray(z, dtype=np.float32))
    grid.add_history("load_numpy", file=path.name)
    return grid
