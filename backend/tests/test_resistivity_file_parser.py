import textwrap

from resistivity_file_parser import ResistivityFileParser


ISOTROPIC_RESISTIVITY = """\
 Format:                         MARE2DEM_1.1
 Anisotropy:                     isotropic
 Number of regions:              2
!#        Rho           Param      Lower        Upper         Prej         Weight
       1   1.0000E+02        1   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00 ! sediment
       2   1.0000E+12        0   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00
"""


# Columns in a "tiz" header are not consistently separated by two or more
# spaces ("Param xy Lower z"), which used to collapse two columns into one.
ANISOTROPIC_RESISTIVITY = """\
 Format:                         MARE2DEM_1.1
 Anisotropy:                     tiz
 Number of regions:              2
!#       Rho-z        Rho-xy       Param z  Param xy Lower z      Upper z      Lower xy     Upper xy     Prej z       Weight       Prej xy      Weight       Prej z/xy    Weight
       1   2.0534E+00   1.2795E+00        1        2   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00
       2   1.0000E+12   1.0000E+12        0        0   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00   0.0000E+00
"""


def _write(tmp_path, name, text):
    path = tmp_path / name
    path.write_text(text, encoding="utf-8")
    return str(path)


def test_isotropic_table_keeps_official_column_names(tmp_path):
    parser = ResistivityFileParser()

    data = parser.parse_resistivity_file(
        _write(tmp_path, "iso.resistivity", ISOTROPIC_RESISTIVITY), rho_parse=True
    )

    table = data["table"]
    assert list(table.columns) == [
        "#", "Rho", "Param", "Lower", "Upper", "Prej", "Weight"
    ]
    assert table["Rho"].tolist() == [100.0, 1.0e12]
    assert table["Param"].tolist() == [1.0, 0.0]


def test_anisotropic_header_keeps_every_column(tmp_path):
    parser = ResistivityFileParser()

    data = parser.parse_resistivity_file(
        _write(tmp_path, "tiz.resistivity", ANISOTROPIC_RESISTIVITY), rho_parse=True
    )

    table = data["table"]
    assert list(table.columns) == [
        "#", "Rho-z", "Rho-xy", "Param z", "Param xy",
        "Lower z", "Upper z", "Lower xy", "Upper xy",
        "Prej z", "Weight z", "Prej xy", "Weight xy",
        "Prej z/xy", "Weight z/xy",
    ]
    assert table.shape == (2, 15)
    assert table["Rho-z"].tolist() == [2.0534, 1.0e12]
    assert table["Rho-xy"].tolist() == [1.2795, 1.0e12]


def test_unknown_header_shape_does_not_raise(tmp_path):
    content = textwrap.dedent("""\
         Number of regions:              1
        !#        Rho           Param
               1   1.0000E+02        1   0.0000E+00
        """)

    data = ResistivityFileParser().parse_resistivity_file(
        _write(tmp_path, "odd.resistivity", content), rho_parse=True
    )

    table = data["table"]
    assert list(table.columns) == ["#", "Rho", "Param", "Column 4"]
    assert table.shape == (1, 4)


def test_extract_resistivity_values_uses_vertical_resistivity(tmp_path):
    parser = ResistivityFileParser()

    data = parser.parse_resistivity_file(
        _write(tmp_path, "tiz.resistivity", ANISOTROPIC_RESISTIVITY), rho_parse=True
    )

    values = parser._extract_resistivity_values(data)

    assert values.tolist() == [2.0534, 1.0e12]


def test_lookup_exposes_both_components_of_an_anisotropic_table(tmp_path):
    import main as backend_main

    data = ResistivityFileParser().parse_resistivity_file(
        _write(tmp_path, "tiz.resistivity", ANISOTROPIC_RESISTIVITY), rho_parse=True
    )

    lookup, components = backend_main._build_region_resistivity_lookup(data)

    # "Rho-xy" is the same quantity older MARE2DEM builds call "Rho-h".
    assert components == [
        {"key": "rhoZ", "label": "Rho-z", "column": "Rho-z"},
        {"key": "rhoH", "label": "Rho-xy", "column": "Rho-xy"},
    ]
    assert lookup[1] == {"rhoZ": 2.0534, "rhoH": 1.2795}
    assert lookup[2] == {"rhoZ": 1.0e12, "rhoH": 1.0e12}


def test_lookup_of_isotropic_table_has_a_single_component(tmp_path):
    import main as backend_main

    data = ResistivityFileParser().parse_resistivity_file(
        _write(tmp_path, "iso.resistivity", ISOTROPIC_RESISTIVITY), rho_parse=True
    )

    lookup, components = backend_main._build_region_resistivity_lookup(data)

    assert components == [{"key": "rho", "label": "Rho", "column": "Rho"}]
    assert lookup[1] == {"rho": 100.0}
