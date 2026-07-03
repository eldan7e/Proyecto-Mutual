import pandas as pd
import json

excel_csv_path = 'C:/Users/dante/OneDrive/Escritorio/pag web/src/utils/excel_dump.csv'
db_json_path = 'C:/Users/dante/.gemini/antigravity/brain/d407cbd0-7262-420d-a722-eb39022c383a/.system_generated/steps/2449/output.txt'

import re

try:
    df_excel = pd.read_csv(excel_csv_path)
    df_excel['NUM_CLEAN'] = df_excel['NUM_CLEAN'].astype(str)
    # Remove .0 at the end if it exists
    df_excel['NUM_CLEAN'] = df_excel['NUM_CLEAN'].str.replace(r'\.0$', '', regex=True)
    # Remove any non-digit
    df_excel['NUM_CLEAN'] = df_excel['NUM_CLEAN'].str.replace(r'[^0-9]', '', regex=True)
    
    import re

    with open(db_json_path, 'r', encoding='utf-8') as f:
        content = f.read()
        
    db_numbers = re.findall(r'\\"numero_linea\\":\\"(\d+)\\"', content)


    db_dict = {}
    db_totals = re.findall(r'\\"numero_linea\\":\\"(\d+)\\",\\"total\\":\\"([\d.]+)\\"', content)
    for num, tot in db_totals:
        num_10 = num[-10:] if len(num) >= 10 else num
        db_dict[num_10] = float(tot)
        
    df_excel['NUM_10'] = df_excel['NUM_CLEAN'].apply(lambda x: str(x)[:-1][-10:] if len(str(x)) == 11 and str(x).endswith('0') else str(x)[-10:])
    
    df_excel = df_excel[df_excel['NUM_10'] != 'nan']

    df_excel = df_excel[~df_excel['COSTO EMPRESA'].isna()]
    
    missing_in_db = df_excel[~df_excel['NUM_10'].isin(db_dict.keys())]
    
    print("Missing lines from DB:")
    print(missing_in_db[['NUM_10', 'COSTO EMPRESA']])
    
    print("\nLines with different costs:")
    diff_sum = 0
    for _, row in df_excel.iterrows():
        n = row['NUM_10']
        if n in db_dict:
            c_excel = round(float(row['COSTO EMPRESA']), 2)
            c_db = round(float(db_dict[n]), 2)
            if abs(c_excel - c_db) > 1:
                print(f"{n}: Excel={c_excel}, DB={c_db}, Diff={c_excel - c_db}")
                diff_sum += (c_excel - c_db)
                
    print(f"\nTotal difference from mismatched costs: {diff_sum}")
    print(f"Total COSTO EMPRESA in Excel: {df_excel['COSTO EMPRESA'].sum()}")


except Exception as e:
    print('Error:', e)
