@echo off
REM Start the CineGraph FastAPI backend
REM KMP_DUPLICATE_LIB_OK fixes the OMP duplicate-runtime error on Windows + Anaconda
set KMP_DUPLICATE_LIB_OK=TRUE
uvicorn main:app --reload
