import uvicorn

if __name__ == '__main__':
    uvicorn.run("service.app:app", host='0.0.0.0', port=44777, reload=True, log_level='error')
