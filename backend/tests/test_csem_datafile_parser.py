from pathlib import Path

from csem_datafile_parser import CSEMDataFileReader


EXPECTED_DATA_TYPE_CODES = [
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '11',
    '12',
    '13',
    '14',
    '15',
    '16',
    '21',
    '22',
    '23',
    '24',
    '25',
    '26',
    '27',
    '28',
    '29',
    '31',
    '32',
    '33',
    '34',
    '35',
    '36',
    '37',
    '38',
    '39',
    '41',
    '42',
    '43',
    '44',
    '103',
    '104',
    '105',
    '106',
    '109',
    '110',
    '113',
    '114',
    '115',
    '116',
    '123',
    '125',
    '129',
    '133',
    '134',
    '135',
    '136',
    '151',
    '152',
    '153',
    '154',
    '155',
    '156',
    '161',
    '162',
    '163',
    '164',
    '165',
    '166',
]


def _write_mt_data_file(path: Path) -> None:
    path.write_text(
        '\n'.join(
            [
                'Format: EMData_2.2',
                'UTM of x,y origin (UTM zone, N, E, 2D strike): 11 N 0 0 0',
                'Reciprocity Used: no',
                '# MT Frequencies: 1',
                '1.0',
                '# MT Receivers: 1',
                '! X Y Z Theta Alpha Beta Length SolveStatic Name',
                '0 0 0 0 0 0 0 0 RX01',
                '# Data: 4',
                '! Type Freq Tx Rx Data StdError',
                '104 1 0 1 45 5',
                '106 1 0 1 50 5',
                '123 1 0 1 1.2 0.1',
                '125 1 0 1 1.3 0.1',
                '',
            ]
        ),
        encoding='utf-8',
    )


def test_reader_uses_full_mare2dem_datatype_catalog(tmp_path):
    """Reader should expose the full official MARE2DEM datatype catalog."""
    data_path = tmp_path / 'mt_sample.data'
    _write_mt_data_file(data_path)

    reader = CSEMDataFileReader(str(data_path))

    assert reader.data_type_codes == EXPECTED_DATA_TYPE_CODES


def test_data_block_init_preserves_documented_mt_datatype_codes(tmp_path):
    """MT datatype codes should stay intact instead of being coerced to NaN."""
    data_path = tmp_path / 'mt_sample.data'
    _write_mt_data_file(data_path)

    reader = CSEMDataFileReader(str(data_path))
    data = reader.data_block_init(reader.blocks['Data'])

    assert data['Type'].isna().sum() == 0
    assert data['Type'].astype(str).tolist() == ['104', '106', '123', '125']


def _write_joint_data_file(path: Path) -> None:
    """Minimal joint CSEM+MT file with the two sides interleaved in the data
    block, and deliberately overlapping Rx indices between the CSEM and MT
    receiver tables so a wrong merge is detectable."""
    path.write_text(
        '\n'.join(
            [
                'Format: EMData_2.2',
                # a real UTM origin: this file goes through ne2latlon, and utm
                # rejects an easting outside 100,000-999,999 m
                'UTM of x,y origin (UTM zone, N, E, 2D strike): 11 N 4000000.0 500000.0 0',
                '# MT Frequencies: 2',
                '0.01',
                '0.02',
                '# MT Receivers: 2',
                '! X Y Z Theta Alpha Beta Length SolveStatic Name',
                '10 -5000 900 0 0 0 0 0 MT01',
                '20 -6000 950 0 0 0 0 0 MT02',
                'Phase Convention: lead',
                'Reciprocity Used: yes',
                '# CSEM Frequencies: 2',
                '1.0',
                '2.0',
                '# Transmitters: 1',
                '! X Y Z Azimuth Dip Length Type Name',
                '0 0 1000 270 0 0 edipole TX01',
                '# CSEM Receivers: 2',
                '! X Y Z Theta Alpha Beta Length Name',
                '100 3000 1200 0 0 0 100 RX01',
                '200 4000 1300 0 0 0 100 RX02',
                '# Data: 4',
                '! Type Freq Tx Rx Data StdError',
                '28 1 1 1 -12.5 0.04',   # CSEM
                '104 1 0 1 45.0 2.9',    # MT, same Rx index as the CSEM row
                '24 2 1 2 30.0 2.9',     # CSEM
                '123 2 0 2 1.3 0.04',    # MT
                '',
            ]
        ),
        encoding='utf-8',
    )


def test_joint_merge_keeps_mt_rows_with_their_own_geometry(tmp_path):
    """Joint files must merge MT rows against the MT receiver and frequency
    tables, not the CSEM ones.

    Regression test: the joint branch used to merge the whole data block
    against the CSEM tables. In a .data that drops every MT row (MT rows carry
    Tx# = 0, which matches no transmitter); in a .resp it silently attaches
    them to CSEM geometry (MARE2DEM writes Tx# = Rx# for MT rows there, which
    matches a CSEM transmitter by accident).
    """
    from main import _parse_csem_datafile
    import io
    import pandas as pd

    data_path = tmp_path / 'joint_sample.data'
    _write_joint_data_file(data_path)

    _geometry, data_js, _blocks = _parse_csem_datafile(str(data_path))
    df = pd.read_json(io.StringIO(data_js), orient='table')

    # nothing dropped, and the original interleaved file order is preserved
    assert len(df) == 4
    assert df['Type'].astype(str).tolist() == ['28', '104', '24', '123']

    mt = df[df['Type'].astype(str).isin({'104', '123'})]
    csem = df[df['Type'].astype(str).isin({'24', '28'})]

    # MT rows carry MT receiver coordinates, not the same-index CSEM ones
    assert mt['Y_rx'].tolist() == [-5000.0, -6000.0]
    assert mt['Name_rx'].tolist() == ['MT01', 'MT02']
    # ... and MT frequencies, not the same-index CSEM ones
    assert mt['Freq'].tolist() == [0.01, 0.02]
    # MT has no transmitter, so transmitter-derived columns stay empty
    assert mt['Y_tx'].isna().all()

    # CSEM rows are untouched by the split
    assert csem['Y_rx'].tolist() == [3000.0, 4000.0]
    assert csem['Freq'].tolist() == [1.0, 2.0]
    assert csem['Y_tx'].tolist() == [0.0, 0.0]
