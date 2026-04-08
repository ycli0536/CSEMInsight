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
